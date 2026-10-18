import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional, Tuple

OPENCAGE_ENDPOINT = "https://api.opencagedata.com/geocode/v1/json"


def geocode_address(
    address: Optional[str],
    countrycode: Optional[str] = "gr",
    api_key: Optional[str] = None,
) -> Optional[Tuple[float, float, str]]:
    """Resolve an address to (longitude, latitude, formatted_address) via OpenCage.

    Returns None when the address is empty, the API key is missing, or nothing is found.
    """
    # OpenCage rejects queries shorter than 2 characters with HTTP 400
    if not address or len(address.strip()) < 2:
        return None
    api_key = api_key or os.getenv("OPENCAGE_API_KEY", "")
    if not api_key:
        return None

    params = {
        "q": address.strip(),
        "key": api_key,
        "limit": 1,
        "no_annotations": 1,
    }
    if countrycode:
        params["countrycode"] = countrycode

    try:
        url = f"{OPENCAGE_ENDPOINT}?{urllib.parse.urlencode(params)}"
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        results = data.get("results", [])
        if results:
            best = results[0]
            return best["geometry"]["lng"], best["geometry"]["lat"], best.get("formatted", "")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")[:300]
        print(f"[geocode] OpenCage failed for {address!r}: HTTP {exc.code} {detail}", flush=True)
    except Exception as exc:
        print(f"[geocode] OpenCage failed for {address!r}: {exc}", flush=True)
    return None


def geocode_lng_lat(address: Optional[str]) -> Tuple[float, float]:
    """Return (longitude, latitude) with fallbacks.

    Both missing -> (0.0, 0.0); only one missing -> it takes the other's value.
    """
    result = geocode_address(address)
    lng, lat = (result[0], result[1]) if result else (None, None)
    if lng is None and lat is None:
        return 0.0, 0.0
    if lng is None:
        lng = lat
    if lat is None:
        lat = lng
    return lng, lat


def reconcile_coords(coach_pt, team_pt):
    """Fill missing coordinates between coach and team/game points.

    Each point is (lng, lat) with None for missing. Both missing -> both (0.0, 0.0);
    one missing -> it copies the other.
    """
    coach_ok = coach_pt[0] is not None and coach_pt[1] is not None
    team_ok = team_pt[0] is not None and team_pt[1] is not None
    if not coach_ok and not team_ok:
        return (0.0, 0.0), (0.0, 0.0)
    if not coach_ok:
        return team_pt, team_pt
    if not team_ok:
        return coach_pt, coach_pt
    return coach_pt, team_pt
