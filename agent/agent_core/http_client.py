"""
HTTP session with connection pooling, automatic retry, and SSL fix.

The SSL CA bundle fix in agent.py (entry point) sets REQUESTS_CA_BUNDLE
before this module is imported, ensuring PyInstaller builds find certs.
This module also explicitly sets verify=True with certifi as fallback.
"""

import os
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

_retry_strategy = Retry(
    total=3,
    backoff_factor=2,                           # Wait 2s, 4s, 8s between retries
    status_forcelist=[502, 503, 504],
    allowed_methods=["HEAD", "GET", "POST", "PATCH"],
)


def _get_ca_bundle():
    """Get the CA bundle path.

    Priority: permanent ProgramData copy → env var → certifi → system default.
    The permanent copy survives PyInstaller _MEI temp dir cleanup.
    """
    permanent = os.path.join(
        os.environ.get("PROGRAMDATA", "C:\\ProgramData"),
        "WinSystemHealth", "cacert.pem",
    )
    if os.path.isfile(permanent):
        return permanent
    env_ca = os.environ.get('REQUESTS_CA_BUNDLE') or os.environ.get('SSL_CERT_FILE')
    if env_ca and os.path.isfile(env_ca):
        return env_ca
    try:
        import certifi
        return certifi.where()
    except ImportError:
        return True


def create_session():
    """Create a new requests.Session with connection pooling, retry, and SSL."""
    session = requests.Session()
    adapter = HTTPAdapter(
        pool_connections=1,
        pool_maxsize=3,
        max_retries=_retry_strategy,
    )
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.verify = _get_ca_bundle()
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
