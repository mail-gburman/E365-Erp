# Linux / AWS deployment guide

## Recommended stack
- Ubuntu 22.04 or Amazon Linux on EC2
- Python virtualenv for backend
- Nginx for reverse proxy and static frontend
- PostgreSQL locally or Amazon RDS
- systemd for backend service management

## EC2 / Linux checklist
1. Open ports:
   - 22 for SSH
   - 80 for HTTP
   - 443 for HTTPS
2. Keep PostgreSQL private if using RDS.
3. Use security groups to restrict DB access to the app server.
4. Use an IAM role on the EC2 instance instead of storing AWS keys on disk.
5. Keep the FastAPI app behind Nginx and run Uvicorn on localhost only.

## Backend
```bash
sudo apt update
sudo apt install -y python3-venv nginx postgresql-client
cd /opt
sudo mkdir -p kps_erp
```

## Frontend
Build with Node.js and copy `dist/` to `/var/www/kps-frontend`.

## AWS notes
Elastic Beanstalk can deploy Python applications and manage EC2, scaling, and health monitoring, while EC2 gives you more manual control. EC2 security groups and IAM roles should be configured as part of the deployment baseline.
