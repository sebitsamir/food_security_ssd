from fastapi import APIRouter, Request, Response

from app.api.deps import GeoDep
from app.geo.loader import GeoMeta, Level

router = APIRouter(prefix="/api/v1/geo", tags=["geo"])
CACHE = "public, max-age=3600, stale-while-revalidate=86400"


def _etag_matches(header: str | None, etag: str) -> bool:
    if not header:
        return False
    tags = {t.strip().removeprefix("W/").strip('"') for t in header.split(",")}
    return "*" in tags or etag in tags


@router.get("/meta", response_model=GeoMeta)
def geo_meta(store: GeoDep) -> GeoMeta:
    return store.meta


@router.get(
    "/{level}", response_class=Response, responses={200: {"content": {"application/geo+json": {}}}}
)
def get_geo(level: Level, request: Request, store: GeoDep) -> Response:
    doc = store.get(level)
    headers = {"ETag": f'"{doc.etag}"', "Cache-Control": CACHE}
    if _etag_matches(request.headers.get("if-none-match"), doc.etag):
        return Response(status_code=304, headers=headers)
    return Response(content=doc.body, media_type="application/geo+json", headers=headers)
