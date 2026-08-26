"""raw / refined JSONL 저장소. 소스별 파일 하나, 게시물당 한 줄."""

import json
from pathlib import Path
from typing import Iterator

from crawler.models import RawPost


class JsonlStore:
    def __init__(self, directory: Path):
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)

    def path(self, source: str) -> Path:
        return self.directory / f"{source}.jsonl"

    def existing_ids(self, source: str, id_key: str = "post_id") -> set[str]:
        ids: set[str] = set()
        p = self.path(source)
        if not p.exists():
            return ids
        with p.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    ids.add(str(json.loads(line)[id_key]))
                except (json.JSONDecodeError, KeyError):
                    continue
        return ids

    def append(self, source: str, record: dict) -> None:
        with self.path(source).open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    def iter_records(self, source: str) -> Iterator[dict]:
        p = self.path(source)
        if not p.exists():
            return
        with p.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    yield json.loads(line)


class RawStore(JsonlStore):
    def append_post(self, post: RawPost) -> None:
        self.append(post.source, post.to_dict())

    def iter_posts(self, source: str) -> Iterator[RawPost]:
        for rec in self.iter_records(source):
            yield RawPost.from_dict(rec)
