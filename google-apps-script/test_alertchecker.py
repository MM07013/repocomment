from __future__ import annotations

import argparse
import csv
import random
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path


NUMBER_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
}

MONTH_MAP = {
    "january": 1,
    "jan": 1,
    "february": 2,
    "feb": 2,
    "march": 3,
    "mar": 3,
    "april": 4,
    "apr": 4,
    "may": 5,
    "june": 6,
    "jun": 6,
    "july": 7,
    "jul": 7,
    "august": 8,
    "aug": 8,
    "september": 9,
    "sep": 9,
    "sept": 9,
    "october": 10,
    "oct": 10,
    "november": 11,
    "nov": 11,
    "december": 12,
    "dec": 12,
}


@dataclass
class Reminder:
    kind: str
    amount: int
    unit: str
    hour: int | None
    minute: int
    ampm: str | None


def convert_to_24_hour(hour12: int, minute: int, ampm: str) -> tuple[int, int]:
    hour = hour12 % 12
    if ampm == "PM":
        hour += 12
    return hour, minute


def build_valid_date(year: int, month: int, day: int) -> datetime | None:
    try:
        return datetime(year, month, day)
    except ValueError:
        return None


def normalize_year(year_text: str) -> int:
    year = int(year_text)
    if len(year_text) == 2:
        return 1900 + year if year >= 70 else 2000 + year
    return year


def add_months(dt: datetime, months: int) -> datetime:
    month_index = dt.month - 1 + months
    year = dt.year + month_index // 12
    month = month_index % 12 + 1
    day = dt.day

    while day > 28:
        try:
            return dt.replace(year=year, month=month, day=day)
        except ValueError:
            day -= 1

    return dt.replace(year=year, month=month, day=day)


def parse_base_date(value: object) -> datetime | None:
    if value in (None, ""):
        return None

    if isinstance(value, datetime):
        return datetime(value.year, value.month, value.day)

    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)

    text = str(value).strip()
    if not text:
        return None

    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%m-%d-%Y", "%m-%d-%y"):
        try:
            parsed = datetime.strptime(text, fmt)
            return datetime(parsed.year, parsed.month, parsed.day)
        except ValueError:
            continue

    return None


def extract_relative_reminder(text: str) -> Reminder | None:
    s = str(text).strip()

    match = re.search(
        r"\b(?:put\s+(?:a\s+)?reminder|remind(?:\s+me)?|alert(?:\s+me)?)\b[\s\S]*?\bday\s+after\s+tomorrow\b(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM))?",
        s,
        re.IGNORECASE,
    )
    if match:
        return Reminder(
            kind="relative",
            amount=2,
            unit="days",
            hour=int(match.group(1)) if match.group(1) else None,
            minute=int(match.group(2)) if match.group(2) else 0,
            ampm=match.group(3).upper() if match.group(3) else None,
        )

    match = re.search(
        r"\b(?:put\s+(?:a\s+)?reminder|remind(?:\s+me)?|alert(?:\s+me)?)\b[\s\S]*?\btomorrow\b(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM))?",
        s,
        re.IGNORECASE,
    )
    if match:
        return Reminder(
            kind="tomorrow",
            amount=1,
            unit="days",
            hour=int(match.group(1)) if match.group(1) else None,
            minute=int(match.group(2)) if match.group(2) else 0,
            ampm=match.group(3).upper() if match.group(3) else None,
        )

    match = re.search(
        r"\b(?:put\s+(?:a\s+)?reminder|remind(?:\s+me)?|alert(?:\s+me)?)\b[\s\S]*?\b(?:of|after|in|on)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(day|days|week|weeks|month|months|year|years)(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM))?\b",
        s,
        re.IGNORECASE,
    )
    if not match:
        return None

    raw_amount = match.group(1).lower()
    amount = int(raw_amount) if raw_amount.isdigit() else NUMBER_WORDS.get(raw_amount)
    if not amount:
        return None

    return Reminder(
        kind="relative",
        amount=amount,
        unit=match.group(2).lower(),
        hour=int(match.group(3)) if match.group(3) else None,
        minute=int(match.group(4)) if match.group(4) else 0,
        ampm=match.group(5).upper() if match.group(5) else None,
    )


def build_relative_reminder_date(base_date: datetime, reminder: Reminder) -> datetime | None:
    d = datetime(base_date.year, base_date.month, base_date.day)

    if reminder.kind == "tomorrow":
        d += timedelta(days=1)
    else:
        if reminder.unit in ("day", "days"):
            d += timedelta(days=reminder.amount)
        elif reminder.unit in ("week", "weeks"):
            d += timedelta(days=reminder.amount * 7)
        elif reminder.unit in ("month", "months"):
            d = add_months(d, reminder.amount)
        elif reminder.unit in ("year", "years"):
            try:
                d = d.replace(year=d.year + reminder.amount)
            except ValueError:
                d = d.replace(month=2, day=28, year=d.year + reminder.amount)
        else:
            return None

    if reminder.hour is not None and reminder.ampm:
        hour, minute = convert_to_24_hour(reminder.hour, reminder.minute, reminder.ampm)
        d = d.replace(hour=hour, minute=minute)

    return d


def normalize_date_text(date_text: str) -> str:
    s = date_text.strip()
    s = re.sub(r"\b(\d{1,2})(st|nd|rd|th)\b", r"\1", s, flags=re.IGNORECASE)
    s = re.sub(r"\bof\b", " ", s, flags=re.IGNORECASE)
    s = s.replace(",", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_month_name_date(date_text: str) -> datetime | None:
    current_year = datetime.now().year
    match = re.match(r"^([A-Za-z]+)\s+(\d{1,2})(?:\s+(\d{4}|\d{2})(?!\s*-))?$", date_text, re.IGNORECASE)
    if not match:
        return None

    month = MONTH_MAP.get(match.group(1).lower())
    if not month:
        return None

    year = normalize_year(match.group(3)) if match.group(3) else current_year
    return build_valid_date(year, month, int(match.group(2)))


def parse_day_month_name_date(date_text: str) -> datetime | None:
    current_year = datetime.now().year
    match = re.match(r"^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}|\d{2})(?!\s*-))?$", date_text, re.IGNORECASE)
    if not match:
        return None

    month = MONTH_MAP.get(match.group(2).lower())
    if not month:
        return None

    year = normalize_year(match.group(3)) if match.group(3) else current_year
    return build_valid_date(year, month, int(match.group(1)))


def parse_month_year_date(date_text: str) -> datetime | None:
    match = re.match(r"^([A-Za-z]+)\s+(\d{4}|\d{2})$", date_text, re.IGNORECASE)
    if not match:
        return None

    month = MONTH_MAP.get(match.group(1).lower())
    if not month:
        return None

    return build_valid_date(normalize_year(match.group(2)), month, 1)


def parse_day_range_month_name_date(date_text: str) -> datetime | None:
    current_year = datetime.now().year
    match = re.match(r"^(\d{1,2})\s*-\s*\d{1,2}\s+([A-Za-z]+)(?:\s+(\d{4}|\d{2}))?$", date_text, re.IGNORECASE)
    if not match:
        return None

    month = MONTH_MAP.get(match.group(2).lower())
    if not month:
        return None

    year = normalize_year(match.group(3)) if match.group(3) else current_year
    return build_valid_date(year, month, int(match.group(1)))


def parse_month_name_day_range_date(date_text: str) -> datetime | None:
    current_year = datetime.now().year
    match = re.match(r"^([A-Za-z]+)\s+(\d{1,2})\s*-\s*\d{1,2}(?:\s+(\d{4}|\d{2}))?$", date_text, re.IGNORECASE)
    if not match:
        return None

    month = MONTH_MAP.get(match.group(1).lower())
    if not month:
        return None

    year = normalize_year(match.group(3)) if match.group(3) else current_year
    return build_valid_date(year, month, int(match.group(2)))


def parse_flexible_date(date_text: str) -> datetime | None:
    current_year = datetime.now().year

    match = re.match(r"^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$", date_text)
    if match:
        return build_valid_date(int(match.group(1)), int(match.group(2)), int(match.group(3)))

    match = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$", date_text)
    if match:
        return build_valid_date(int(match.group(3)), int(match.group(1)), int(match.group(2)))

    match = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$", date_text)
    if match:
        return build_valid_date(normalize_year(match.group(3)), int(match.group(1)), int(match.group(2)))

    match = re.match(r"^(\d{1,2})[/-](\d{1,2})$", date_text)
    if match:
        return build_valid_date(current_year, int(match.group(1)), int(match.group(2)))

    parsed = parse_month_name_date(date_text)
    if parsed:
        return parsed

    parsed = parse_day_month_name_date(date_text)
    if parsed:
        return parsed

    parsed = parse_month_year_date(date_text)
    if parsed:
        return parsed

    parsed = parse_day_range_month_name_date(date_text)
    if parsed:
        return parsed

    return parse_month_name_day_range_date(date_text)


def find_first_absolute_date(text: str) -> datetime | None:
    patterns = [
        r"\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b",
        r"\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b",
        r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2}\b",
        r"\b\d{1,2}[/-]\d{1,2}\b",
        r"\b[A-Za-z]+\s+\d{4}\b",
        r"\b\d{1,2}\s*-\s*\d{1,2}\s+[A-Za-z]+(?:\s+\d{4}|\s+\d{2})?\b",
        r"\b[A-Za-z]+\s+\d{1,2}\s*-\s*\d{1,2}(?:\s+\d{4}|\s+\d{2})?\b",
        r"\b[A-Za-z]+\s+\d{1,2}(?:\s+(?:\d{4}|\d{2})(?!\s*-))?\b",
        r"\b\d{1,2}\s+[A-Za-z]+(?:\s+(?:\d{4}|\d{2})(?!\s*-))?\b",
    ]

    best_match: tuple[int, datetime] | None = None

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            continue

        parsed = parse_flexible_date(match.group(0))
        if not parsed:
            continue

        if best_match is None or match.start() < best_match[0]:
            best_match = (match.start(), parsed)

    return best_match[1] if best_match else None


def extract_absolute_reminder_date(text: str) -> datetime | None:
    clean_text = str(text).strip()
    reminder_match = re.search(r"\b(?:remind(?:\s+me)?|alert(?:\s+me)?)\b", clean_text, re.IGNORECASE)
    if not reminder_match:
        return None

    remaining = normalize_date_text(clean_text[reminder_match.start():])
    return find_first_absolute_date(remaining)


def contains_reminder_language(text: str) -> bool:
    return bool(re.search(r"\b(remind|alert)\b", str(text), re.IGNORECASE))


def calculate_alert_date(base_date_value: object, comment: str, existing_alert_value: object = "", *, today: datetime | None = None) -> datetime | None:
    today = today or datetime.now()
    today_midnight = datetime(today.year, today.month, today.day)

    alert_date = None
    matched_real_pattern = False

    if isinstance(comment, str) and comment.strip():
        base_date = parse_base_date(base_date_value)

        relative_reminder = extract_relative_reminder(comment)
        if base_date and relative_reminder:
            alert_date = build_relative_reminder_date(base_date, relative_reminder)
            matched_real_pattern = True
        else:
            reminder_date = extract_absolute_reminder_date(comment)
            if reminder_date:
                alert_date = reminder_date - timedelta(days=1)
                matched_real_pattern = True

        if not matched_real_pattern and contains_reminder_language(comment):
            existing_date = parse_base_date(existing_alert_value)
            if not existing_date or existing_date <= today_midnight:
                alert_date = today_midnight + timedelta(days=1)
            else:
                alert_date = existing_date

    return alert_date


def random_comment() -> str:
    names = ["john", "albert", "nik", "team", "maria", "project x"]
    suffixes = [
        "to check the checker",
        "to follow up",
        "for the meeting",
        "to review AI test",
        "to check status",
        "",
    ]
    templates = [
        "remind {name} after {n} days {suffix}",
        "remind {name} in {n} days {suffix}",
        "alert {name} after {n} weeks {suffix}",
        "remind me after {word} days",
        "remind {name} tomorrow {suffix}",
        "remind {name} day after tomorrow {suffix}",
        "remind me on April {day}, that I have AI test",
        "check this later",
    ]

    template = random.choice(templates)
    return re.sub(
        r"\s+",
        " ",
        template.format(
            name=random.choice(names),
            n=random.randint(1, 40),
            word=random.choice(list(NUMBER_WORDS.keys())),
            day=random.randint(1, 28),
            suffix=random.choice(suffixes),
        ),
    ).strip()


def run_cases(base_date: str, count: int) -> list[tuple[str, datetime | None]]:
    sample_comments = [
        "Remind me on April 24, that I have AI test",
        "Remind Nik tomorrow to check the Remind flow",
        "remind alerbt after 32 days to check the checker",
        "remind john in 4 days to check",
        "remind me after two days",
        "I might not work on Monday so let's schedule for Tuesday",
        "alert maria after 2 months to follow up",
        "remind project x day after tomorrow",
    ]

    while len(sample_comments) < count:
        sample_comments.append(random_comment())

    return [(comment, calculate_alert_date(base_date, comment, today=parse_base_date(base_date))) for comment in sample_comments[:count]]


def load_csv_cases(csv_path: Path, fallback_base_date: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []

    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError("CSV file must include a header row.")

        normalized_headers = {header.strip().lower(): header for header in reader.fieldnames if header}
        has_named_headers = all(name in normalized_headers for name in ("cola", "colb", "colc"))

        if has_named_headers:
            for row in reader:
                rows.append(
                    {
                        "colA": (row.get(normalized_headers["cola"]) or fallback_base_date).strip() or fallback_base_date,
                        "colB": (row.get(normalized_headers.get("colb", "")) or "").strip(),
                        "colC": (row.get(normalized_headers["colc"]) or "").strip(),
                        "colD": (row.get(normalized_headers.get("cold", "")) or "").strip(),
                    }
                )
        else:
            handle.seek(0)
            plain_reader = csv.reader(handle)
            for raw_row in plain_reader:
                if not raw_row or not any(cell.strip() for cell in raw_row):
                    continue

                while len(raw_row) < 4:
                    raw_row.append("")

                rows.append(
                    {
                        "colA": raw_row[0].strip() or fallback_base_date,
                        "colB": raw_row[1].strip(),
                        "colC": raw_row[2].strip(),
                        "colD": raw_row[3].strip(),
                    }
                )

    return rows


def export_csv_results(rows: list[dict[str, str]], output_path: Path, fallback_base_date: str) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["colA", "colB", "colC", "colD", "calculatedColD"],
        )
        writer.writeheader()

        for row in rows:
            alert_date = calculate_alert_date(
                row["colA"],
                row["colC"],
                existing_alert_value=row["colD"],
                today=parse_base_date(row["colA"]) or parse_base_date(fallback_base_date),
            )
            writer.writerow(
                {
                    "colA": row["colA"],
                    "colB": row["colB"],
                    "colC": row["colC"],
                    "colD": row["colD"],
                    "calculatedColD": alert_date.strftime("%d-%b-%Y %I:%M %p") if alert_date else "",
                }
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Test reminder parsing logic from ALERTCHECKER.gs.")
    parser.add_argument("--base-date", default="4/6/2026", help="Base date used for column A values.")
    parser.add_argument("--count", type=int, default=20, help="Number of test rows to print.")
    parser.add_argument("--csv", help="Optional CSV path with columns colA,colB,colC,colD.")
    parser.add_argument("--out-csv", help="Optional output CSV path with calculatedColD added.")
    args = parser.parse_args()

    if args.csv:
        csv_path = Path(args.csv)
        rows = load_csv_cases(csv_path, args.base_date)
        print(f"Testing ALERTCHECKER logic with CSV: {csv_path}")
        print("-" * 120)

        for index, row in enumerate(rows, start=1):
            alert_date = calculate_alert_date(
                row["colA"],
                row["colC"],
                existing_alert_value=row["colD"],
                today=parse_base_date(row["colA"]) or parse_base_date(args.base_date),
            )
            rendered = alert_date.strftime("%d-%b-%Y %I:%M %p") if alert_date else "<no date>"
            print(f"{index:02d}. colA={row['colA']} | colB={row['colB']} | colC={row['colC']}")
            print(f"    EXISTING COL D -> {row['colD'] or '<blank>'}")
            print(f"    CALCULATED ALERT ON DATE -> {rendered}")

        if args.out_csv:
            output_path = Path(args.out_csv)
            export_csv_results(rows, output_path, args.base_date)
            print("-" * 120)
            print(f"Exported CSV results to: {output_path}")
    else:
        print(f"Testing ALERTCHECKER logic with base date: {args.base_date}")
        print("-" * 100)

        results = run_cases(args.base_date, args.count)
        for index, (comment, alert_date) in enumerate(results, start=1):
            rendered = alert_date.strftime("%d-%b-%Y %I:%M %p") if alert_date else "<no date>"
            print(f"{index:02d}. {comment}")
            print(f"    ALERT ON DATE -> {rendered}")


if __name__ == "__main__":
    main()
