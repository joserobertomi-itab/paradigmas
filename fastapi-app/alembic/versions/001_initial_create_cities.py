"""Initial create cities table

Revision ID: 001
Revises: 
Create Date: 2026-01-23 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create cities table
    op.create_table(
        'cities',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('city', sa.String(length=255), nullable=False),
        sa.Column('city_ascii', sa.String(length=255), nullable=False),
        sa.Column('lat', sa.Numeric(precision=10, scale=7), nullable=False),
        sa.Column('lng', sa.Numeric(precision=10, scale=7), nullable=False),
        sa.Column('country', sa.String(length=255), nullable=False),
        sa.Column('iso2', sa.String(length=2), nullable=False),
        sa.Column('iso3', sa.String(length=3), nullable=False),
        sa.Column('admin_name', sa.String(length=255), nullable=True),
        sa.Column('capital', sa.String(length=50), nullable=True),
        sa.Column('population', sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index(op.f('ix_cities_country'), 'cities', ['country'], unique=False)
    op.create_index(op.f('ix_cities_iso2'), 'cities', ['iso2'], unique=False)
    op.create_index(op.f('ix_cities_population'), 'cities', ['population'], unique=False)
    op.create_index('idx_country_city_ascii', 'cities', ['country', 'city_ascii'], unique=False)


def downgrade() -> None:
    # Drop indexes
    op.drop_index('idx_country_city_ascii', table_name='cities')
    op.drop_index(op.f('ix_cities_population'), table_name='cities')
    op.drop_index(op.f('ix_cities_iso2'), table_name='cities')
    op.drop_index(op.f('ix_cities_country'), table_name='cities')
    
    # Drop table
    op.drop_table('cities')
