# Stage 1

### Core Actions
1. Fetch latest notifications
2. Mark notification as read
3. Listen for real-time pushed payloads

### REST APIs

**1. Fetch Notifications**
- Endpoint: `GET /api/notifications`
- Headers: `Authorization: Bearer <token>`
- Response Structure:
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "type": "Placement",
      "message": "string",
      "timestamp": "ISO-8601"
    }
  ]
}
```

**2. Mark as Read**
- Endpoint: `PATCH /api/notifications/{id}/read`
- Headers: `Authorization: Bearer <token>`
- Request Body: `{}`
- Response Structure:
```json
{
  "status": "success"
}
```

### Real-Time Mechanism
A persistent **WebSocket** connection is established between the client and the server. The backend emits an event directly to the user's socket session upon notification generation, mitigating traffic bursts against HTTP servers from constant polling.

# Stage 2

### Database Choice
**PostgreSQL** provides ACID compliance, strong relations between the `students` table and `notifications`, robust index mechanisms like B-Tree and GIN, and is perfectly scalable for campus operations.

### Schema
```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    studentId INT NOT NULL,
    notificationType VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    isRead BOOLEAN DEFAULT false,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Volume Issues & Solutions
As the `notifications` table grows to tens of millions of records, read and write performance deteriorates dramatically. To resolve this:
1. **Partitioning**: Partition tables by date (e.g., monthly). This keeps active queries operating on significantly smaller, in-memory datasets.
2. **Archival**: Implement automated cron jobs to purge or move messages older than 6 months into cold storage solutions (e.g., AWS S3 or a secondary DB).

# Stage 3

### Query Analysis
The query is logically accurate. It fetches unread records for a specific student sorted by creation time.
It is slow because the database executes a **Sequential Scan** (checking 5 million rows individually). There are no indexes, forcing data into memory to sort by `createdAt DESC`.

### Proposed Change & Cost
Create a composite index to directly cover the WHERE and ORDER BY clauses: `CREATE INDEX idx_unread_recent ON notifications (studentId, isRead, createdAt DESC);`
Computation cost shifts from `O(N)` scans to an efficient `O(log N)` B-Tree search.

### Index Every Column?
This is extremely bad advice. While indexes improve read speeds, they degrade write performance significantly because every index must be individually updated during INSERT/UPDATE operations. They also consume heavy disk space and cache memory.

### 7-Day Search Query
```sql
SELECT DISTINCT studentId 
FROM notifications 
WHERE notificationType = 'Placement' 
  AND createdAt >= NOW() - INTERVAL '7 days';
```

# Stage 4

### Strategy and Tradeoffs
Fetching notifications on every page load overloads the database and unnecessarily drains connection pools.

**Solution: Redis Caching Layer**
Cache the first page of notifications and the user's unread counter in Redis. When the client requests notifications, the application reads RAM rather than disk.
- **Tradeoffs**: Excellent reduction of DB load, extreme read speed. However, it requires additional infrastructure cost and creates cache invalidation complexities (e.g., synchronizing states).

**Alternative Solution: Client-Side State**
Maintain state using the WebSocket connection and IndexedDB on the client.
- **Tradeoffs**: Zero server overload on pagination, but potential for desynchronization if the active socket drops.

# Stage 5

### Shortcomings
1. **Single Point of Failure**: The application drops directly if the `send_email` third-party API rate-limits or fails. Users 201 through 50,000 receive nothing.
2. **Synchronous Blocking**: Network requests are executing sequentially inside a loop. This requires exponential time, blocking application threads.
3. **Tight Coupling**: Database connections and push infrastructure are locked to email success.

### Redesign & Concurrency
No, saving to the database and sending an email should not happen simultaneously or sequentially in the same block.

The internal Database insertion should be completed in a high-speed batch operation or transaction. Following this, 50,000 individual tasks should be enqueued into an asynchronous Message Broker (e.g., BullMQ, RabbitMQ). Independent worker threads then pick up the tasks to safely execute the third-party email API calls. This prevents user-facing timeouts and enables retry policies.

### Revised Pseudocode
```python
function notify_all(student_ids: array, message: string):
    batch_insert_db(student_ids, message)
    
    for student_id in student_ids:
        job_queue.add("email_task", { student_id, message })
        job_queue.add("push_task", { student_id, message })

function process_email_task(job):
    try:
        send_email(job.student_id, job.message)
    except APIError:
        job.retry(delay=5_minutes, max_retries=3)
```

# Stage 6

### Priority Inbox Code
Implemented in `notification_app_be/app.js`.

### Approach and Top 10 Efficiency
The application asynchronously retrieves the payloads from the Evaluation API. It dynamically applies integer weightings based on the `Type` field.
When scaling this to continuous data streams, fully sorting the array using `O(N log N)` mechanics becomes inefficient.
To maintain a Top 10 list efficiently against continuous streams, I would implement a **Min-Heap (Priority Queue)** constrained to a strict length of 10. As new payloads stream in, insertion operations only cost `O(log K)` (where K=10). This avoids re-sorting the entire dataset entirely. For a bulk static fetch, standard Array prototype sorting is utilized.

Zero native logs exist; every debug/status trace utilizes the required `logging_middleware` interface.
