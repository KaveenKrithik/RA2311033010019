# Notification System Design

## Stage 1: API Design

### Core Actions
1. Fetch latest notifications
2. Mark notification as read
3. Real-time delivery mechanism

### REST APIs

**1. Fetch Notifications**
- **Endpoint**: `GET /api/v1/notifications`
- **Headers**: `Authorization: Bearer <token>`
- **Response**:
```json
{
  "status": "success",
  "data": [
    {
      "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
      "type": "Placement",
      "message": "CSX Corporation hiring",
      "isRead": false,
      "timestamp": "2026-04-22T17:51:30Z"
    }
  ]
}
```

**2. Mark Notification as Read**
- **Endpoint**: `PATCH /api/v1/notifications/:id/read`
- **Headers**: `Authorization: Bearer <token>`
- **Request**: `{}` (Empty body, implicitly sets read status to true)
- **Response**:
```json
{
  "status": "success",
  "message": "Notification marked as read"
}
```

### Real-Time Delivery Mechanism
I propose using WebSockets (e.g., via Socket.io or direct native WebSockets) for real-time delivery. When a user connects to the web app, they establish a secure WebSocket connection. The backend can then push JSON payload events (e.g., `notification_received`) directly to the active client as soon as a new notification is generated, bypassing the need for frequent polling.

---

## Stage 2: Persistent Storage

### Database Choice
**PostgreSQL** is recommended due to its strong ACID compliance, relational capabilities (ideal for joining students and notifications), and support for advanced indexing.

### Schema
**Table: notifications**
- `id` (UUID, Primary Key)
- `studentId` (Integer, Indexed, Foreign Key to students table)
- `type` (Enum: 'Placement', 'Event', 'Result')
- `message` (Text)
- `isRead` (Boolean, Default: false)
- `createdAt` (Timestamp, Default: CURRENT_TIMESTAMP)

### Data Volume Issues
As data volume increases, single-table reads/writes will slow down. Solutions:
1. **Partitioning**: Partition the table by `createdAt` (e.g., monthly) to keep active query sizes small.
2. **Archiving**: Move notifications older than 6 months to cold storage.
3. **Caching**: Store unread counts and recent notifications in Redis.

### SQL Query (Insert)
```sql
INSERT INTO notifications (id, studentId, type, message, isRead, createdAt)
VALUES (gen_random_uuid(), 1042, 'Placement', 'Advanced Micro Devices Inc. hiring', false, CURRENT_TIMESTAMP);
```

---

## Stage 3: Query Optimization

**Query Analysis**
```sql
SELECT * FROM notifications WHERE studentID = 1042 AND isRead = false ORDER BY createdAt DESC;
```
**Accuracy:** The query is accurate for fetching unread messages for a specific student, sorted by newest first.
**Slowness Reason:** With 5,000,000 records, filtering by `studentID` and `isRead` without an index causes a full table scan. Additionally, the `ORDER BY createdAt` phase requires sorting in memory.
**Improvement:** Create a composite index. Single-column indexing (on every column) is poor advice because it increases disk usage and severely degrades write (INSERT/UPDATE) performance unnecessarily.

**Index Creation:**
```sql
CREATE INDEX idx_student_unread_recent ON notifications (studentId, isRead, createdAt DESC);
```
**Computation Cost:** Lookup becomes O(log N) instead of O(N), significantly reducing disk I/O and CPU overhead.

**Query (Placement in last 7 days):**
```sql
SELECT DISTINCT studentId 
FROM notifications 
WHERE type = 'Placement' 
  AND createdAt >= NOW() - INTERVAL '7 days';
```

---

## Stage 4: Scalability

**Strategy for High Load**
Fetching on every page load overloads the database.
1. **Caching Layer (Redis):** Cache the first page of notifications and the "unread count" for active users in Redis. When a new notification arrives, update both the DB and the Redis cache.
2. **Tradeoffs:** 
   - *Pros*: Drastically reduces DB reads, exceptionally fast.
   - *Cons*: Cache invalidation complexity, eventual consistency, increased infrastructure costs and maintenance.

---

## Stage 5: Reliability & Redesign

**Shortcomings of Provided Pseudocode:**
- **Synchronous Execution:** Email API, DB saving, and push are happening sequentially in a loop. A slow API will block the entire process.
- **No Fault Tolerance/Retry:** If `send_email` fails on user 100, the loop crashes, and users 101-50000 get nothing.
- **Coupling:** Database saves shouldn't depend on external Email API success directly in the same synchronous block.

**Redesign:**
Use an Event-Driven architecture with a Message Broker / Job Queue (e.g., BullMQ, RabbitMQ, Kafka). DB inserts and Queue pushes happen together (transactionally if possible), but the actual Email sending is handled asynchronously by workers.

**Revised Pseudocode:**
```python
function notify_all(student_ids: array, message: string):
    # Batch insert into DB for speed
    batch_save_to_db(student_ids, message)
    
    # Enqueue tasks to a message broker (e.g., Redis Queue)
    for student_id in student_ids:
        enqueue_job(queue_name="email_queue", payload={student_id, message})
        enqueue_job(queue_name="push_queue", payload={student_id, message})

# Worker 1 (Email worker - can run concurrently)
function process_email_queue(job):
    try:
        send_email(job.student_id, job.message)
    except APIError:
        job.retry(delay=5_minutes, max_retries=3)

# Worker 2 (App Push worker)
function process_push_queue(job):
    try:
        push_to_app(job.student_id, job.message)
    except PushError:
        job.retry()
```

---

## Stage 6: Implementation Approach

For Stage 6, I have implemented an Express application (`app.js`) that fetches real-time data from the provided API, sorts them based on a combined priority formula (Type Weight and Recency), and returns the top 10 results. 
- Type Weights: Placement (3) > Result (2) > Event (1).
- Recency is used as a secondary descending sort. 
- It uses a custom logging middleware implemented in (`logger.js`). This middleware captures requests, processes, errors, and system configuration directly to the evaluation logging API. Local built-in console.logs or file loggers are avoided entirely.

