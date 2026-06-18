import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { desc, eq } from 'drizzle-orm';
import { ADMIN_COOKIE, checkAdmin } from '@/lib/admin';
import { getDb } from '@/lib/db';
import { repostRequests, introRequests } from '@/lib/schema';
import { retweet } from '@/lib/twitter';
import { repostRequiresApproval } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fmt(d: Date | null): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 16).replace('T', ' ');
}

// ── server actions ─────────────────────────────────────────────────────────

async function updateIntroStatus(formData: FormData): Promise<void> {
  'use server';
  const store = await cookies();
  if (!checkAdmin(store.get(ADMIN_COOKIE)?.value)) return;
  const id = formData.get('id');
  const status = formData.get('status');
  if (typeof id !== 'string' || typeof status !== 'string') return;
  if (!['pending', 'contacted', 'declined'].includes(status)) return;
  await getDb().update(introRequests).set({ status }).where(eq(introRequests.id, id));
  revalidatePath('/admin');
}

async function approveRepost(formData: FormData): Promise<void> {
  'use server';
  const store = await cookies();
  if (!checkAdmin(store.get(ADMIN_COOKIE)?.value)) return;
  const id = formData.get('id');
  if (typeof id !== 'string') return;
  const db = getDb();
  const rows = await db.select().from(repostRequests).where(eq(repostRequests.id, id)).limit(1);
  const row = rows[0];
  // Only repost rows that genuinely passed screening and are awaiting approval —
  // never trust the status alone.
  if (!row || row.reposted || row.screenDecision !== 'pass' || row.status !== 'pending_approval') {
    return;
  }
  try {
    const { repostId } = await retweet(row.tweetId);
    await db.update(repostRequests)
      .set({ reposted: true, repostTweetId: repostId, status: 'approved' })
      .where(eq(repostRequests.id, id));
  } catch {
    await db.update(repostRequests).set({ status: 'repost_failed' }).where(eq(repostRequests.id, id));
  }
  revalidatePath('/admin');
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const store = await cookies();
  const authed = checkAdmin(store.get(ADMIN_COOKIE)?.value);

  if (!authed) {
    return (
      <div className="container">
        <h1>Admin</h1>
        {sp.error ? <p style={{ color: '#ef4444' }}>Incorrect password.</p> : null}
        <form method="post" action="/api/admin/login">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" />
          <button type="submit">Sign in</button>
        </form>
      </div>
    );
  }

  let intros: (typeof introRequests.$inferSelect)[] = [];
  let reposts: (typeof repostRequests.$inferSelect)[] = [];
  let dbError: string | null = null;
  try {
    const db = getDb();
    intros = await db.select().from(introRequests).orderBy(desc(introRequests.createdAt)).limit(100);
    reposts = await db.select().from(repostRequests).orderBy(desc(repostRequests.createdAt)).limit(100);
  } catch (err) {
    dbError = err instanceof Error ? err.message : 'Database error';
  }

  const showApprove = repostRequiresApproval();

  return (
    <div className="container">
      <h1>Admin</h1>
      {dbError ? <p style={{ color: '#ef4444' }}>DB error: {dbError}</p> : null}

      <section>
        <h2 style={{ marginBottom: 12 }}>Intro requests ($5)</h2>
        {intros.length === 0 ? (
          <p className="muted">No submissions yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Project</th>
                <th>Category</th>
                <th>Contact</th>
                <th>Pitch</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {intros.map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.createdAt)}</td>
                  <td>{r.projectName}</td>
                  <td>{r.category}</td>
                  <td>{r.contact}</td>
                  <td>{r.pitch}</td>
                  <td>{r.status}</td>
                  <td>
                    <form action={updateIntroStatus} style={{ display: 'flex', gap: 6 }}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" name="status" value="contacted">
                        Contacted
                      </button>
                      <button type="submit" name="status" value="declined">
                        Declined
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 style={{ marginBottom: 12 }}>Repost requests ($1)</h2>
        {reposts.length === 0 ? (
          <p className="muted">No requests yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Tweet</th>
                <th>Screen</th>
                <th>Reason</th>
                <th>Reposted</th>
                <th>Status</th>
                {showApprove ? <th>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {reposts.map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.createdAt)}</td>
                  <td>
                    <a href={r.tweetUrl} target="_blank" rel="noreferrer">
                      {r.tweetId}
                    </a>
                  </td>
                  <td>{r.screenDecision ?? '—'}</td>
                  <td>{r.screenReason ?? '—'}</td>
                  <td>{r.reposted ? 'yes' : 'no'}</td>
                  <td>{r.status}</td>
                  {showApprove ? (
                    <td>
                      {r.status === 'pending_approval' ? (
                        <form action={approveRepost}>
                          <input type="hidden" name="id" value={r.id} />
                          <button type="submit">Approve &amp; repost</button>
                        </form>
                      ) : (
                        '—'
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
