import os

file_path = r"c:\Users\Pheberyan\Documents\ta-backupppp\docs\DOCUMENTATION.html"

# Simplified, robust Mermaid Class Diagram syntax
# - Removed explicit types (e.g. "String name" -> "+name") to avoid parsing errors
# - Added direction TB
# - Restored methods that were missing
# - Strict indentation
new_mermaid_content = """                <div class="mermaid">
classDiagram
    direction TB
    class User {
        +id
        +nimNidn
        +name
        +email
        +role
        +login()
        +logout()
    }
    class Student {
        +major
        +semester
        +maxCredits
        +joinQueue()
        +enrollWorkshop()
    }
    class Mentor {
        +department
        +maxStudents
        +createWorkshop()
        +approveUser()
    }
    class Workshop {
        +id
        +code
        +name
        +credits
        +workshopType
    }
    class Session {
        +id
        +quota
        +seatsEnabled
        +getAvailableSeats()
    }
    class Seat {
        +id
        +seatNumber
        +status
        +lock()
        +reserve()
        +confirm()
    }
    class Enrollment {
        +id
        +enrolledAt
        +status
    }

    User <|-- Student
    User <|-- Mentor
    Workshop *-- Session
    Session *-- Seat
    Student --> Enrollment
    Enrollment --> Session
    Enrollment --> Seat
                </div>
"""

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

output_lines = []
found_header = False
in_mermaid_block = False
replaced = False

for line in lines:
    if "<h4>🏗️ Struktur Class Utama</h4>" in line:
        found_header = True
        output_lines.append(line)
        continue

    if found_header and '<div class="mermaid">' in line and not replaced:
        in_mermaid_block = True
        output_lines.append(new_mermaid_content)
        replaced = True
        continue

    if in_mermaid_block:
        if "</div>" in line:
            in_mermaid_block = False
        continue

    output_lines.append(line)

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(output_lines)

print("Fixed Class Diagram with robust syntax.")
