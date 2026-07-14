import sys

sys.path.insert(0, ".")

from app.auth import hash_password  # noqa: E402

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python3 scripts/hash_password.py <plain_password>")
        sys.exit(1)

    print(hash_password(sys.argv[1]))
