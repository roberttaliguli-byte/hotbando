#!/usr/bin/env perl
use strict;
use warnings;
use DBI;
use FindBin;
use POSIX qw(:sys_wait_h);

# This verifier intentionally refuses to connect anywhere except scratch3 on
# localhost using the local test account supplied for Phase 3.
$ENV{DB_HOST} = 'localhost';
$ENV{DB_PORT} = '3306';
$ENV{DB_NAME} = 'scratch3';
$ENV{DB_USER} = 'hbtest';
$ENV{DB_PASSWORD} = 'hbtest_local_only';

my $worker = ($ARGV[0] || '') eq '--worker';
my $module = "$FindBin::Bin/../freeradius/perl/hotbando_auth.pl";
require $module;

our (%RAD_REQUEST, %RAD_CHECK, %RAD_REPLY);
my $nas = 'verify-radius-accounting-' . $$;
my @created_phones;

sub connect_scratch {
    my $dbh = DBI->connect(
        'DBI:mysql:database=scratch3;host=localhost;port=3306',
        'hbtest', 'hbtest_local_only',
        { RaiseError => 1, PrintError => 0, AutoCommit => 1 }
    ) or die "Cannot connect to authorized scratch3 database: $DBI::errstr";
    my ($database, $account) = $dbh->selectrow_array('SELECT DATABASE(), CURRENT_USER()');
    die "Refusing non-scratch DB session ($database / $account)\n"
        unless $database eq 'scratch3' && $account =~ /^hbtest\@localhost$/;
    return $dbh;
}

sub set_packet {
    my ($status, $session_id, $username, $input, $output) = @_;
    %RAD_REQUEST = (
        'Acct-Status-Type' => $status,
        'Acct-Session-Id' => $session_id,
        'User-Name' => $username,
        'NAS-Identifier' => $nas,
        'Calling-Station-Id' => '02:00:00:00:00:01',
        'Acct-Input-Octets' => $input,
        'Acct-Input-Gigawords' => 0,
        'Acct-Output-Octets' => $output,
        'Acct-Output-Gigawords' => 0,
    );
}

sub send_packet {
    my (@packet) = @_;
    set_packet(@packet);
    my $result = main::accounting();
    die "accounting returned $result instead of RLM_MODULE_OK\n" unless $result == 2;
    return $result;
}

sub create_customer {
    my ($paid, $free) = @_;
    my $dbh = connect_scratch();
    my $phone = '259' . time() . int(rand(1_000_000)) . scalar(@created_phones);
    push @created_phones, $phone;
    $dbh->do(
        q{INSERT INTO users (name, phone_number, password, role, package, usage_until,
                            paid_bytes_remaining, paid_data_limit_bytes, free_bytes, is_active)
          VALUES (?, ?, 'verify-only', 'customer', 'VERIFY', DATE_ADD(NOW(), INTERVAL 1 DAY), ?, ?, ?, 1)},
        undef, 'RADIUS accounting verifier', $phone, $paid, $paid, $free
    );
    $dbh->disconnect();
    return $phone;
}

sub balances {
    my ($phone) = @_;
    my $dbh = connect_scratch();
    my $row = $dbh->selectrow_hashref(
        'SELECT paid_bytes_remaining, free_bytes FROM users WHERE phone_number = ?',
        undef, $phone
    ) or die "Verifier customer disappeared from scratch3\n";
    $dbh->disconnect();
    return (0 + $row->{paid_bytes_remaining}, 0 + $row->{free_bytes});
}

sub cleanup {
    return if $worker;
    my $dbh = eval { connect_scratch() } or return;
    $dbh->do('DELETE FROM radius_usage_sessions WHERE nas_identity = ?', undef, $nas);
    for my $phone (@created_phones) {
        $dbh->do('DELETE FROM users WHERE phone_number = ?', undef, $phone);
    }
    $dbh->disconnect();
}

END { cleanup(); }

if ($worker) {
    my ($session_id, $sequence) = @ARGV[1, 2];
    my $phone = $ARGV[3];
    $nas = $ARGV[4];
    set_packet('Interim-Update', $session_id, $phone, $sequence * 1000, $sequence * 100);
    my $result = main::accounting();
    exit($result == 2 ? 0 : 1);
}

eval {
    # Ensure the DB user and active schema are exactly the scratch target before
    # inserting or deleting any fixture data.
    connect_scratch()->disconnect();

    # 1. Interim followed by Stop: octet counters are cumulative, so the Stop
    # charges only the increment over the preceding interim packet.
    my $phone1 = create_customer(1_000, 1_000);
    send_packet('Interim-Update', 'single-interim-stop', $phone1, 400, 100);
    send_packet('Stop', 'single-interim-stop', $phone1, 700, 200);
    my ($paid1, $free1) = balances($phone1);
    die "Test 1 balances wrong: paid=$paid1 free=$free1\n" unless $paid1 == 100 && $free1 == 1_000;
    print "PASS 1: interim then stop charged exactly 900 bytes (paid consumed=900, free consumed=0)\n";

    # 2. A byte-identical retransmission has a zero delta after the first commit.
    my $phone2 = create_customer(500, 500);
    send_packet('Interim-Update', 'duplicate-interim', $phone2, 100, 50);
    send_packet('Interim-Update', 'duplicate-interim', $phone2, 100, 50);
    my ($paid2, $free2) = balances($phone2);
    die "Test 2 balances wrong: paid=$paid2 free=$free2\n" unless $paid2 == 350 && $free2 == 500;
    print "PASS 2: identical interim packet retransmission charged once (150 bytes)\n";

    # 3. Fork 20 independent clients with increasing cumulative counters for
    # one session. Row locking plus GREATEST(octets) yields one final delta.
    my $phone3 = create_customer(13_000, 9_000);
    my $session3 = 'parallel-interims';
    my @children;
    for my $sequence (1 .. 20) {
        my $pid = fork();
        die "fork failed: $!\n" unless defined $pid;
        if ($pid == 0) {
            exec $^X, __FILE__, '--worker', $session3, $sequence, $phone3, $nas;
            exit 127;
        }
        push @children, $pid;
    }
    my $failed_workers = 0;
    for my $pid (@children) {
        waitpid($pid, 0);
        $failed_workers++ if $? != 0;
    }
    die "$failed_workers parallel accounting workers failed\n" if $failed_workers;
    my ($paid3, $free3) = balances($phone3);
    my $consumed3 = (13_000 - $paid3) + (9_000 - $free3);
    die "Test 3 total mismatch: consumed=$consumed3 paid=$paid3 free=$free3\n"
        unless $consumed3 == 22_000 && $paid3 == 0 && $free3 == 0;
    print "PASS 3: 20 parallel interim packets charged the final 22,000-byte delta exactly once (paid=13,000, free=9,000)\n";

    # 4. Spend paid allowance first, then free; saturation never makes either
    # balance negative when usage exceeds both allowances.
    my $phone4 = create_customer(300, 250);
    send_packet('Interim-Update', 'paid-before-free', $phone4, 400, 0);
    my ($paid4a, $free4a) = balances($phone4);
    die "Test 4 split wrong: paid=$paid4a free=$free4a\n" unless $paid4a == 0 && $free4a == 150;
    send_packet('Stop', 'paid-before-free', $phone4, 900, 0);
    my ($paid4b, $free4b) = balances($phone4);
    die "Test 4 saturation wrong: paid=$paid4b free=$free4b\n" unless $paid4b == 0 && $free4b == 0;
    print "PASS 4: paid consumed before free; both balances saturated at zero and never went negative\n";

    # 5. Replace the DB connector with a deterministic unavailable-DB stub.
    # No SQL is issued, the handler returns FAIL, and balances stay unchanged.
    my $phone5 = create_customer(700, 600);
    my ($paid5_before, $free5_before) = balances($phone5);
    set_packet('Interim-Update', 'db-failure', $phone5, 100, 0);
    my $result5;
    {
        no warnings 'redefine';
        local *main::_db_connect = sub { return undef; };
        $result5 = main::accounting();
    }
    my ($paid5_after, $free5_after) = balances($phone5);
    die "Test 5 did not return RLM_MODULE_FAIL (got $result5)\n" unless $result5 == 1;
    die "Test 5 changed balances\n" unless $paid5_after == $paid5_before && $free5_after == $free5_before;
    print "PASS 5: simulated DB connection failure returned FAIL and left balances unchanged\n";
    1;
} or do {
    my $error = $@ || 'unknown verifier failure';
    warn "FAIL verify-radius-accounting: $error";
    exit 1;
};

cleanup();
exit 0;
