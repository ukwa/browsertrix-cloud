"""
Storage API handling
"""

import os
from typing import Optional

from pydantic import BaseModel, UUID4
from fastapi import APIRouter, Depends
from bson.objectid import ObjectId

from users import User

# ============================================================================
class Storage(BaseModel):
    """Storage Base Model"""

    title: str
    user: UUID4


# ============================================================================
class S3Storage(Storage):
    """S3 Storage Model"""

    endpoint_url: str
    is_public: Optional[bool]


# ============================================================================
class StorageOps:
    """Storage API operations"""

    def __init__(self, db):
        self.storages_coll = db["storages"]

    async def add_storage(self, storage: S3Storage):
        """Add new storage"""
        return await self.storages_coll.insert_one(storage.dict())

    async def create_storage_for_user(self, endpoint_prefix: str, user: User):
        """Create default storage for new user"""
        endpoint_url = os.path.join(endpoint_prefix, str(user.id)) + "/"
        storage = S3Storage(
            endpoint_url=endpoint_url, is_public=False, user=user.id, title="default"
        )
        print(f"Created Default Endpoint at ${endpoint_url}")
        await self.add_storage(storage)

    async def get_storages(self, user: User):
        """Get all storages for user"""
        cursor = self.storages_coll.find({"user": user.id})
        return await cursor.to_list(length=1000)

    async def get_storage(self, uid: str, user: User):
        """Get a storage for user"""
        return await self.storages_coll.find_one(
            {"_id": ObjectId(uid), "user": user.id}
        )


# ============================================================================
def init_storages_api(app, mdb, user_dep: User):
    """Init storage api router for /storages"""
    ops = StorageOps(mdb)

    router = APIRouter(
        prefix="/storages",
        tags=["storages"],
        responses={404: {"description": "Not found"}},
    )

    @router.get("/")
    async def get_storages(user: User = Depends(user_dep)):
        results = await ops.get_storages(user)
        return {
            "storages": [
                {
                    "id": str(res["_id"]),
                    "title": res["title"],
                    "endpoint_url": res["endpoint_url"],
                }
                for res in results
            ]
        }

    @router.get("/{id}")
    async def get_storage(uid: str, user: User = Depends(user_dep)):
        res = await ops.get_storage(uid, user)
        print(res)
        if not res:
            return {}

        return {"id": uid, "title": res["title"], "endpoint_url": res["endpoint_url"]}

    @router.post("/")
    async def add_storage(storage: S3Storage, user: User = Depends(user_dep)):
        storage.user = user.id
        res = await ops.add_storage(storage)
        return {"added": str(res.inserted_id)}

    app.include_router(router)

    return ops