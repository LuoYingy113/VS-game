"""One-off: re-geocode every stored location and overwrite the coordinate columns.

Run after setting OPENCAGE_API_KEY:  python backfill_geocode.py
Unresolvable addresses are stored as NULL.
"""
from database import SessionLocal
from geocoding import geocode_lng_lat
import models


def main():
    db = SessionLocal()
    try:
        for u in db.query(models.User).filter(models.User.default_location.isnot(None)).all():
            u.default_location_lng, u.default_location_lat = geocode_lng_lat(u.default_location)
        for c in db.query(models.Club).filter(models.Club.default_location.isnot(None)).all():
            c.default_location_lng, c.default_location_lat = geocode_lng_lat(c.default_location)
        for g in db.query(models.Game).all():
            g.location_lng, g.location_lat = geocode_lng_lat(g.location)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
