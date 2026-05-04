# Notification System Design

---

## Stage 1

### Core Actions

The notification platform needs to support the following actions:

1. Fetch all notifications for a student (with optional filters)
2. Fetch a single notification by ID
3. Mark a single notification as read
4. Mark all notifications as read
5. Get the unread notification count
6. Get the top N priority notifications (priority inbox)

---

### REST API Endpoints

#### 1. List notifications

```
GET /api/notifications
```

**Query parameters**

| Param  | Type   | Required | Description                          |
|--------|--------|----------|--------------------------------------|
| type   | string | No       | Filter by type: Placement, Result, Event |
| page   | number | No       | Page number (default: 1)             |
| limit  | number | No       | Items per page (default: 20, max: 100) |

**Request headers**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Response — 200**

```json
{
  "total": 50,
  "page": 1,
  "limit": 20,
  "notifications": [
    {
      "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
      "type": "Placement",
      "message": "TCS is hiring — walk-in on Friday",
      "isRead": false,
      "createdAt": "2026-04-22T17:51:30Z"
    }
  ]
}
```

---

#### 2. Get a single notification

```
GET /api/notifications/:id
```

**Request headers**

```
Authorization: Bearer <token>
```

**Response — 200**

```json
{
  "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
  "type": "Placement",
  "message": "TCS is hiring — walk-in on Friday",
  "isRead": false,
  "createdAt": "2026-04-22T17:51:30Z"
}
```

**Response — 404**

```json
{ "error": "notification not found" }
```

---

#### 3. Mark a notification as read

```
PATCH /api/notifications/:id/read
```

**Request headers**

```
Authorization: Bearer <token>
```

**Response — 200**

```json
{ "message": "notification marked as read", "id": "d146095a-..." }
```

---

#### 4. Mark all notifications as read

```
PATCH /api/notifications/read-all
```

**Request headers**

```
Authorization: Bearer <token>
```

**Response — 200**

```json
{ "message": "50 notifications marked as read" }
```

---

#### 5. Get unread count

```
GET /api/notifications/unread-count
```

**Request headers**

```
Authorization: Bearer <token>
```

**Response — 200**

```json
{ "unreadCount": 12 }
```

---

#### 6. Priority inbox — top N notifications

```
GET /api/notifications/priority?n=10
```

**Query parameters**

| Param | Type   | Required | Description                      |
|-------|--------|----------|----------------------------------|
| n     | number | No       | How many top notifications to return (default: 10) |

**Request headers**

```
Authorization: Bearer <token>
```

**Response — 200**

```json
{
  "top": 10,
  "notifications": [
    {
      "id": "b283218f-ea5a-4b7c-93a9-1f2f240d64b0",
      "type": "Placement",
      "message": "CSX Corporation hiring",
      "isRead": false,
      "createdAt": "2026-04-22T17:51:18Z"
    }
  ]
}
```

---

### Real-time Notification Mechanism

For real-time delivery, the system uses **WebSockets** via Socket.io.

**How it works:**

- When a student opens the app, the frontend connects to the backend WebSocket server.
- The server maintains a map of `studentId -> socket`.
- When a new notification is created (e.g., by an admin clicking "Notify All"), the backend emits a `notification:new` event to the relevant socket(s).
- The frontend listens for this event and updates the UI without a page reload.

**Relevant socket events:**

| Event               | Direction        | Payload                    |
|---------------------|------------------|----------------------------|
| `notification:new`  | server → client  | notification object        |
| `notification:read` | server → client  | `{ id }` of read item      |

This avoids polling and provides instant delivery with minimal server overhead.

---

## Stage 2

### Recommended Database: PostgreSQL

**Why PostgreSQL:**

- Notifications have a clear relational structure — a notification belongs to a type, is linked to students, and has timestamps. Relational databases model this cleanly.
- PostgreSQL supports JSONB columns for flexible metadata without losing ACID guarantees.
- Rich support for indexing strategies (B-tree, partial indexes) that matter at scale.
- Mature ecosystem with tooling for migrations, connection pooling (pgBouncer), and read replicas.

NoSQL (e.g., MongoDB) would also work but gives up transactional consistency on multi-document writes without additional configuration. Since we need reliable "mark all as read" operations touching many rows, PostgreSQL is the safer choice.

---

### Schema

```sql
CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');

-- master notifications table — one row per notification event
CREATE TABLE notifications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type          notification_type NOT NULL,
    message       TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- per-student notification delivery and read state
CREATE TABLE student_notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      BIGINT NOT NULL,
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (student_id, notification_id)
);

-- students table (referenced by student_id)
CREATE TABLE students (
    id        BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name      TEXT NOT NULL,
    email     TEXT NOT NULL UNIQUE,
    roll_no   TEXT NOT NULL UNIQUE
);
```

---

### Problems as Data Volume Grows

1. **Full-table scans** on `student_notifications` when fetching by `student_id` without an index.
2. **Slow "mark all as read"** updates that touch thousands of rows for one student.
3. **Hot row contention** on frequently read notification rows.
4. **Storage bloat** — millions of `student_notifications` rows for each broadcast.

**Solutions:**

- **Composite indexes** on `(student_id, is_read, created_at)` to support the most common query pattern.
- **Partial indexes** e.g. `WHERE is_read = FALSE` so unread queries skip read rows entirely.
- **Table partitioning** by `created_at` (monthly ranges) so old data doesn't slow current queries.
- **Archival strategy** — move notifications older than 6 months to a cold store or separate table.
- **Read replicas** to offload read-heavy queries from the primary.

---

### SQL Queries

**Fetch all notifications for a student (paginated)**

```sql
SELECT n.id, n.type, n.message, n.created_at, sn.is_read
FROM student_notifications sn
JOIN notifications n ON n.id = sn.notification_id
WHERE sn.student_id = $1
ORDER BY n.created_at DESC
LIMIT $2 OFFSET $3;
```

**Mark a notification as read**

```sql
UPDATE student_notifications
SET is_read = TRUE, read_at = NOW()
WHERE student_id = $1 AND notification_id = $2;
```

**Mark all notifications as read for a student**

```sql
UPDATE student_notifications
SET is_read = TRUE, read_at = NOW()
WHERE student_id = $1 AND is_read = FALSE;
```

**Get unread count**

```sql
SELECT COUNT(*) AS unread_count
FROM student_notifications
WHERE student_id = $1 AND is_read = FALSE;
```

**Top N priority notifications**

```sql
SELECT n.id, n.type, n.message, n.created_at, sn.is_read
FROM student_notifications sn
JOIN notifications n ON n.id = sn.notification_id
WHERE sn.student_id = $1 AND sn.is_read = FALSE
ORDER BY
    CASE n.type
        WHEN 'Placement' THEN 3
        WHEN 'Result'    THEN 2
        WHEN 'Event'     THEN 1
    END DESC,
    n.created_at DESC
LIMIT $2;
```

---

## Stage 3

### Is the query accurate?

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

It is **functionally reasonable** but has issues:

- If `notifications` is a single flat table with one row per student-notification pair, then `studentID` and `isRead` columns make sense structurally.
- However, using `SELECT *` fetches every column even if the client only needs a few fields. This wastes I/O and network bandwidth at scale.

---

### Why is it slow?

With 50,000 students and 5,000,000 notifications, this query is slow because:

1. **No index on (studentID, isRead, createdAt).** PostgreSQL falls back to a full sequential scan of the entire table — all 5 million rows — and then filters in memory.
2. **`isRead = false` is low-selectivity only for active users.** If most notifications have been read, the index on `isRead` alone would be very selective; but without a composite index, the planner may still choose a seq scan.
3. **`ORDER BY createdAt DESC`** without an index that covers the sort column forces an in-memory sort of all matching rows before returning them.

---

### What to change

**Add a composite partial index:**

```sql
CREATE INDEX idx_notifications_student_unread
ON notifications (studentID, createdAt DESC)
WHERE isRead = false;
```

This index only stores rows where `isRead = false`, so it stays small as notifications get read. The planner can do an index scan that directly returns rows in the correct sort order — no in-memory sort needed.

**Rewrite the query to select only needed columns:**

```sql
SELECT id, type, message, createdAt, isRead
FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

**Likely computation cost after the index:**

- Index scan: O(log N + k) where k is the number of unread rows for that student. For a student with 20 unread notifications out of 5 million, this is essentially O(1) in practice.
- Without the index it was O(N) = O(5,000,000).

---

### Is adding indexes on every column a good idea?

**No.** This advice is harmful at scale for several reasons:

- Each index is a separate data structure that must be **updated on every INSERT, UPDATE, and DELETE**. With 50,000 students all receiving notifications, writes become significantly more expensive.
- Indexes consume **disk space and memory** (shared buffer cache). Unnecessary indexes evict useful ones from cache.
- The query planner may **choose the wrong index** when many exist, leading to worse plans than a targeted index.
- Many columns (e.g. boolean `isRead`, enum `type`) have very low cardinality. An index on those alone gives the planner almost no selectivity benefit.

The right approach is to index based on actual query patterns — typically `(studentID, createdAt DESC)` with a partial filter on `isRead = false`.

---

### Query: students who got a Placement notification in the last 7 days

```sql
SELECT DISTINCT sn.student_id
FROM student_notifications sn
JOIN notifications n ON n.id = sn.notification_id
WHERE n.type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days';
```

If working with a flat table where `notification_type` is an enum column on the notifications table:

```sql
SELECT DISTINCT studentID
FROM notifications
WHERE notificationType = 'Placement'
  AND createdAt >= NOW() - INTERVAL '7 days';
```

---

## Stage 4

### Problem

Fetching from the DB on every page load for every student creates:

- Repeated identical queries hitting the primary database.
- High read IOPS that crowd out write operations.
- Slow response times under load.

---

### Solutions and Trade-offs

#### 1. In-process memory cache (simple, fast, limited)

Cache the notification list for each student in the application server's memory with a short TTL (e.g. 30 seconds).

**Trade-offs:**

| Pro | Con |
|-----|-----|
| Zero infrastructure cost | Cache is per-process — loses data on restart |
| Sub-millisecond access | If you run multiple server instances, each has its own stale copy |
| Simple to implement | Memory grows with active user count |

---

#### 2. Shared cache with Redis (recommended)

Store `student:{id}:notifications` as a JSON blob in Redis. On a cache hit, skip the DB entirely. Invalidate the key when a new notification is created or one is marked read.

**Trade-offs:**

| Pro | Con |
|-----|-----|
| Shared across all server instances | Adds infrastructure (Redis) |
| Configurable TTL per key | Cache invalidation logic must be maintained carefully |
| Very fast (sub-millisecond) | Stale data window between invalidation and refresh |
| Redis supports pub/sub — can also power real-time delivery | Extra network hop vs in-process cache |

---

#### 3. Unread count caching only

Instead of caching the full list, only cache the unread count per student. The full list is fetched from DB on demand, but the badge count (which is fetched on every page load) is served from Redis.

**Trade-offs:**

| Pro | Con |
|-----|-----|
| Very low memory footprint | Only solves the count query, not the full list |
| Easy to invalidate precisely | Still DB round-trip for the full list |

---

#### 4. Pagination + cursor-based fetching

Never fetch the full notification list. Always fetch one page at a time using a cursor (`createdAt` timestamp). The client requests more only when the user scrolls.

**Trade-offs:**

| Pro | Con |
|-----|-----|
| Dramatically reduces rows transferred per request | More complex client-side state management |
| Works well even without caching | Cursor must be carefully managed for deleted or updated rows |

---

#### Recommended strategy

Use **Redis caching for unread count** (invalidated on write) combined with **cursor-based pagination** for the full list. This eliminates the most frequent DB calls while keeping complexity manageable.

---

## Stage 5

### Shortcomings with the proposed implementation

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)
        save_to_db(student_id, message)
        push_to_app(student_id, message)
```

1. **Synchronous loop over 50,000 students** — each iteration waits for the email API, DB write, and socket push to complete before moving to the next student. Total time = sum of all operations. At even 50ms per student, this is 2,500 seconds.

2. **No error isolation** — if `send_email` fails for student 500, the loop can crash or stop, leaving the remaining 49,500 students unnotified.

3. **No retries** — a transient email API failure is treated the same as a permanent one.

4. **No atomicity** — if the process crashes midway, there is no record of who was already notified. On restart, some students get duplicates, others get nothing.

5. **DB is hammered with 50,000 individual inserts** — no batching.

---

### What happened when send_email failed for 200 students

Without tracking, we don't know which 200 students were affected. We cannot retry just the failed ones — we'd have to re-run the whole job and risk duplicates for the 49,800 who succeeded.

---

### Redesign: Queue-based, decoupled approach

**Should DB insert and email happen together?**

No. They are independent side-effects. Linking them means a failure in the email API rolls back the DB insert (or vice versa), which is wrong — we want the in-app notification to appear even if the email fails.

---

### Revised pseudocode

```
function notify_all(student_ids: array, message: string):
    # Step 1: persist the notification record once
    notification_id = save_notification_to_db(message, type="Placement")

    # Step 2: batch-insert delivery rows (one per student)
    batch_insert_student_notifications(notification_id, student_ids, status="pending")

    # Step 3: push each delivery task onto a job queue
    for student_id in student_ids:
        queue.push({
            job: "deliver_notification",
            student_id: student_id,
            notification_id: notification_id
        })


# Workers pick up jobs from the queue independently
function deliver_notification(job):
    student_id      = job.student_id
    notification_id = job.notification_id

    # send email — retry up to 3 times with exponential backoff
    email_ok = false
    for attempt in 1..3:
        try:
            send_email(student_id, notification_id)
            email_ok = true
            break
        catch transient_error:
            wait(2 ^ attempt seconds)

    # push real-time in-app notification (best-effort — no retry needed)
    try:
        push_to_app(student_id, notification_id)
    catch:
        log("warn", "socket push failed for student", student_id)

    # mark delivery row based on outcome
    if email_ok:
        update_delivery_status(student_id, notification_id, status="delivered")
    else:
        update_delivery_status(student_id, notification_id, status="failed")
        # dead-letter queue handles permanent failures for manual review
        dlq.push(job)
```

**Why this works:**

- The notification is saved to the DB before any delivery attempt — students will see it in-app even if the email job is still processing.
- Workers run in parallel across however many machines we have, so 50,000 jobs complete in seconds not hours.
- Each job tracks its own status — the 200 failed emails are clearly identified in the `failed` status rows and can be retried from the dead-letter queue without touching the successful deliveries.
- Email and in-app delivery are independent — one failing does not block the other.

---

## Stage 6

### Approach: Priority Sort with a Min-Heap for streaming data

**For the batch case (fetching a fixed list):**

Sort the full list by a composite key:
1. Primary: type weight — Placement=3, Result=2, Event=1
2. Secondary: timestamp descending (newer first within same type)

Slice the top N from the sorted result. This is O(n log n) but n is small for a single student.

**For the streaming case (new notifications arriving continuously):**

Maintain a min-heap of size N. As each new notification arrives:

1. If the heap has fewer than N items — push the new notification.
2. If the heap has N items — compare the new notification's priority against the heap's minimum (the weakest item currently in the top N).
   - If the new notification has higher priority, pop the minimum and push the new one.
   - Otherwise, discard the new notification (it doesn't belong in the top N).

This keeps the top N up to date in O(log N) per incoming notification, regardless of total volume. The heap always holds exactly the N highest-priority items seen so far.

**Priority function used:**

```
score = typeWeight * 10^13 + unixTimestamp
```

Since `typeWeight` is 1, 2, or 3, and Unix timestamps are around 1.7 × 10^9, multiplying by 10^13 ensures type strictly dominates while timestamp breaks ties within the same type.

---

### Code

The priority inbox implementation is in `notification_app_be/src/utils/priority.js` and is exposed via `GET /api/notifications/priority?n=10`.

See the route at `notification_app_be/src/routes/notification.js` and the handler at `notification_app_be/src/handlers/notification.handler.js`.

The implementation fetches live data from the test server notification API, applies the priority sort, and returns the top N results.
