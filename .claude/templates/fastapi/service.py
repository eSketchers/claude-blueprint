from sqlalchemy.orm import Session
from typing import List, Optional

from ..models.example import Example
from . import schemas


def create_example(db: Session, example: schemas.ExampleCreate, user_id: int) -> Example:
    """Create a new example in the database."""
    db_example = Example(
        **example.dict(),
        user_id=user_id,
    )
    db.add(db_example)
    db.commit()
    db.refresh(db_example)
    return db_example


def get_examples(
    db: Session,
    skip: int = 0,
    limit: int = 10,
    user_id: Optional[int] = None,
) -> List[Example]:
    """Get all examples with optional filtering by user."""
    query = db.query(Example)
    if user_id is not None:
        query = query.filter(Example.user_id == user_id)
    return query.offset(skip).limit(limit).all()


def get_example(db: Session, example_id: int, user_id: Optional[int] = None) -> Optional[Example]:
    """Get a specific example by ID."""
    query = db.query(Example).filter(Example.id == example_id)
    if user_id is not None:
        query = query.filter(Example.user_id == user_id)
    return query.first()


def update_example(
    db: Session,
    example_id: int,
    example: schemas.ExampleUpdate,
    user_id: int,
) -> Optional[Example]:
    """Update an existing example."""
    db_example = get_example(db, example_id, user_id)
    if not db_example:
        return None

    update_data = example.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_example, field, value)

    db.commit()
    db.refresh(db_example)
    return db_example


def delete_example(db: Session, example_id: int, user_id: int) -> bool:
    """Delete an example by ID."""
    db_example = get_example(db, example_id, user_id)
    if not db_example:
        return False

    db.delete(db_example)
    db.commit()
    return True
