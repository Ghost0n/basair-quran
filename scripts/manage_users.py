from __future__ import annotations

import argparse
from getpass import getpass
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.app.services import auth_service


def resolve_password(provided_password: str | None) -> str:
    if provided_password:
        return provided_password

    first = getpass("Password: ")
    second = getpass("Confirm password: ")
    if first != second:
        raise SystemExit("Passwords did not match.")
    return first


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage Q-Basair private beta users.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    create_parser = subparsers.add_parser("create", help="Create a new user.")
    create_parser.add_argument("--email", required=True)
    create_parser.add_argument("--password")
    create_parser.add_argument("--admin", action="store_true")

    password_parser = subparsers.add_parser("set-password", help="Reset an existing user's password.")
    password_parser.add_argument("--email", required=True)
    password_parser.add_argument("--password")

    disable_parser = subparsers.add_parser("disable", help="Disable an existing user.")
    disable_parser.add_argument("--email", required=True)

    enable_parser = subparsers.add_parser("enable", help="Enable an existing user.")
    enable_parser.add_argument("--email", required=True)

    subparsers.add_parser("list", help="List current users.")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    auth_service.ensure_auth_db()

    try:
        if args.command == "create":
            password = resolve_password(args.password)
            user = auth_service.create_user(args.email, password, is_admin=args.admin)
            role = "admin" if user.is_admin else "user"
            print(f"Created {role} account for {user.email} (id={user.id}).")
            return 0

        if args.command == "set-password":
            password = resolve_password(args.password)
            user = auth_service.set_user_password(args.email, password)
            print(f"Updated password for {user.email}.")
            return 0

        if args.command == "disable":
            user = auth_service.set_user_active(args.email, False)
            print(f"Disabled {user.email}.")
            return 0

        if args.command == "enable":
            user = auth_service.set_user_active(args.email, True)
            print(f"Enabled {user.email}.")
            return 0

        if args.command == "list":
            users = auth_service.list_users()
            if not users:
                print("No users found.")
                return 0
            for user in users:
                status = "active" if user.is_active else "disabled"
                role = "admin" if user.is_admin else "user"
                print(f"{user.email}\t{role}\t{status}\tid={user.id}")
            return 0
    except auth_service.AuthError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
