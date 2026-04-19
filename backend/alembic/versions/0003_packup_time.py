from alembic import op
import sqlalchemy as sa

revision = "0003_packup_time"
down_revision = "0002_tally_integration"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("event_bookings", sa.Column("packup_time", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("event_bookings", "packup_time")
