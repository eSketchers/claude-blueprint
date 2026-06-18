from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..auth.dependencies import get_current_user
from ..models.user import User
from . import schemas, service

router = APIRouter(
    prefix="/examples",
    tags=["examples"],
    dependencies=[Depends(get_current_user)],
)


@router.post(
    "/",
    response_model=schemas.ExampleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new example",
)
async def create_example(
    example: schemas.ExampleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new example with the following information:

    - **name**: Example name (required)
    - **description**: Example description (optional)
    """
    return service.create_example(db, example, current_user.id)


@router.get(
    "/",
    response_model=List[schemas.ExampleResponse],
    summary="Get all examples",
)
async def get_examples(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve all examples with pagination.
    """
    return service.get_examples(db, skip=skip, limit=limit, user_id=current_user.id)


@router.get(
    "/{example_id}",
    response_model=schemas.ExampleResponse,
    summary="Get example by ID",
)
async def get_example(
    example_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific example by ID.
    """
    example = service.get_example(db, example_id, current_user.id)
    if not example:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Example with id {example_id} not found",
        )
    return example


@router.put(
    "/{example_id}",
    response_model=schemas.ExampleResponse,
    summary="Update example",
)
async def update_example(
    example_id: int,
    example: schemas.ExampleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update an existing example.
    """
    updated = service.update_example(db, example_id, example, current_user.id)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Example with id {example_id} not found",
        )
    return updated


@router.delete(
    "/{example_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete example",
)
async def delete_example(
    example_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete an example by ID.
    """
    deleted = service.delete_example(db, example_id, current_user.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Example with id {example_id} not found",
        )
