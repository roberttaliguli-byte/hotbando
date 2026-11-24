#!/bin/sh
# HotBando FreeRADIUS entrypoint
# Substitutes environment variables in config files before starting

# Substitute env vars in RADIUS config files
for f in /etc/raddb/clients.conf /etc/raddb/mikrotik.secret; do
    if [ -f "$f" ]; then
        sed -i "s/\${RADIUS_SECRET}/$RADIUS_SECRET/g" "$f"
        sed -i "s/\${DB_HOST}/$DB_HOST/g" "$f"
        sed -i "s/\${DB_PORT}/$DB_PORT/g" "$f"
        sed -i "s/\${DB_NAME}/$DB_NAME/g" "$f"
        sed -i "s/\${DB_USER}/$DB_USER/g" "$f"
        sed -i "s/\${DB_PASSWORD}/$DB_PASSWORD/g" "$f"
    fi
done

exec freeradius -f "$@"
