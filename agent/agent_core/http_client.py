"""
HTTP session with connection pooling and automatic retry.
Reuses TCP connections for lower latency and resource usage.
"""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

_retry_strategy = Retry(
    total=3,                                    # Retry up to 3 times
    backoff_factor=1,                           # Wait 1s, 2s, 4s between retries
    status_forcelist=[502, 503, 504],           # Retry on server errors
    allowed_methods=["POST", "PATCH"],
)


def create_session():
    """Create a new requests.Session with connection pooling and retry."""
    session = requests.Session()
    adapter = HTTPAdapter(pool_connections=1, pool_maxsize=2, max_retries=_retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def reset_session(session):
    """Close and recreate the HTTP session (fixes stale connections)."""
    try:
        session.close()
    except Exception:
        pass
    return create_session()


# Global shared session
http = create_session()
