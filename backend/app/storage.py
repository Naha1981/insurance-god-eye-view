from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from sqlalchemy import (
    JSON,
    DateTime,
    Integer,
    LargeBinary,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    delete,
    func,
    insert,
    select,
)
from sqlalchemy.engine import Connection, Engine

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "claimtrace.sqlite3"

metadata = MetaData()

tenants = Table(
    "tenants", metadata,
    String("id", length=120),
)
