from alembic import op
import sqlalchemy as sa

revision = "0004_pan_blood_emergency"
down_revision = "0003_packup_time"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("vendors", sa.Column("pan_number", sa.String(), nullable=True))
    op.add_column("clients", sa.Column("pan_number", sa.String(), nullable=True))
    op.add_column("crew_members", sa.Column("pan_number", sa.String(), nullable=True))
    op.add_column("crew_members", sa.Column("blood_group", sa.String(), nullable=True))
    op.add_column("crew_members", sa.Column("emergency_contact", sa.String(), nullable=True))
    op.add_column("crew_members", sa.Column("emergency_contact_phone", sa.String(), nullable=True))

def downgrade():
    op.drop_column("crew_members", "emergency_contact_phone")
    op.drop_column("crew_members", "emergency_contact")
    op.drop_column("crew_members", "blood_group")
    op.drop_column("crew_members", "pan_number")
    op.drop_column("clients", "pan_number")
    op.drop_column("vendors", "pan_number")
