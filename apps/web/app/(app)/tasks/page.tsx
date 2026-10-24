'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, Search, X } from 'lucide-react';
import type { Recurrence } from '@friday/shared';
import type { Task } from '@/lib/types';
import { api } from '@/lib/api';
import { useAction, useResource } from '@/lib/hooks';
import { fmtDay, fromLocalInput, relativeTime, toLocalInput } from '@/lib/format';
import { Button, Card, Chip, Empty, ErrorNote, Field, IconButton, Loading, PageHeader, inputClass } from '@/components/ui';
import { TaskItem } from '@/components/TaskItem';
import { QuickAdd } from '@/components/QuickAdd';
import { useSession } from '@/components/AppShell';

const VIEWS = [
  { id: 'today', label: 'Today', query: 'view=today&status=open' },
  { id: 'upcoming', label: 'Upcoming', query: 'view=upcoming&status=open' },
  { id: 'overdue', label: 'Overdue', query: 'view=overdue&status=open' },
  { id: 'all', label: 'All open', query: 'view=all&status=open' },
  { id: 'done', label: 'Done', query: 'view=all&status=done' },
] as const;

interface Project { id: string; name: string }

function TaskEditor({ task, projects, onClose, onSaved }: { task: Task; projects: Project[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [due, setDue] = useState(toLocalInput(task.dueAt));
  const [priority, setPriority] = useState(task.priority);
  const [tags, setTags] = useState(task.tags.join(', '));
  const [projectId, setProjectId] = useState(task.projectId ?? '');
  const [freq, setFreq] = useState<Recurrence['freq']>(task.recurrence.freq);
  const history = useResource<{ history: { kind: string; createdAt: string }[] }>(`/tasks/${task.id}`);
  const save = useAction(async (e: FormEvent) => {
    e.preventDefault();
    await api.patch(`/tasks/${task.id}`, {
      title,
      notes: notes || null,
      dueAt: fromLocalInput(due),
      priority,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      projectId: projectId || null,
      recurrence: freq === task.recurrence.freq ? task.recurrence : { freq },
    });
    onSaved();
    onClose();
  });
  const remove = useAction(async () => {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    await api.del(`/tasks/${task.id}`);
    onSaved();
    onClose();
  });

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Edit task">
      <button className="absolute inset-0 bg-black/60" aria-label="Close" onClick={onClose} />
      <form onSubmit={(e) => void save.run(e)} className="safe-bottom absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-raised p-5 md:inset-y-0 md:left-auto md:right-0 md:w-[28rem] md:rounded-none md:border-l md:border-t-0">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="display display-md">Edit task</h2>
          <IconButton type="button" label="Close" onClick={onClose}><X className="size-5" /></IconButton>
        </div>
        <div className="flex flex-col gap-4">
          <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} className={inputClass} /></Field>
          <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={5000} className={`${inputClass} py-2`} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Due"><input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} /></Field>
            <Field label="Priority">
              <select value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])} className={inputClass}>
                {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p[0]!.toUpperCase() + p.slice(1)}</option>)}
              </select>
            </Field>
            <Field label="Repeats">
              <select value={freq} onChange={(e) => setFreq(e.target.value as Recurrence['freq'])} className={inputClass}>
                <option value="none">Never</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
            <Field label="Project">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputClass}>
                <option value="">None</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Tags" hint="Comma separated"><input value={tags} onChange={(e) => setTags(e.target.value)} className={inputClass} /></Field>
          {save.error || remove.error ? <ErrorNote message={(save.error ?? remove.error)!} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" pending={save.pending}>Save</Button>
            <Button type="button" variant="danger" onClick={() => void remove.run()} pending={remove.pending}>Delete</Button>
          </div>
          <div>
            <p className="eyebrow mb-2">History</p>
            {history.loading ? <Loading /> : (
              <ul className="text-sm text-muted">
                {history.data?.history.map((h, i) => <li key={i} className="py-0.5 capitalize">{h.kind} · {relativeTime(h.createdAt)}</li>)}
              </ul>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

export default function TasksPage() {
  const { prefs } = useSession();
  const [view, setView] = useState<(typeof VIEWS)[number]['id']>('today');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [priority, setPriority] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);
  const [newProject, setNewProject] = useState('');
  const projects = useResource<{ projects: Project[] }>('/projects');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const path = useMemo(() => {
    const v = VIEWS.find((x) => x.id === view)!;
    const params = new URLSearchParams(v.query);
    if (debounced) params.set('q', debounced);
    if (priority) params.set('priority', priority);
    if (projectFilter) params.set('projectId', projectFilter);
    params.set('limit', '100');
    return `/tasks?${params.toString()}`;
  }, [view, debounced, priority, projectFilter]);
  const { data, error, loading, reload } = useResource<{ tasks: Task[] }>(path);

  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of data?.tasks ?? []) {
      const key = t.dueAt ? fmtDay(t.dueAt, prefs?.timezone) : 'No date';
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return [...map.entries()];
  }, [data, prefs?.timezone]);

  const addProject = useAction(async (e: FormEvent) => {
    e.preventDefault();
    if (!newProject.trim()) return;
    await api.post('/projects', { name: newProject.trim() });
    setNewProject('');
    projects.reload();
  });

  return (
    <div>
      <PageHeader title="Tasks" subtitle="Plan your day, one clear step at a time." />
      <Card className="mb-4"><QuickAdd onSaved={reload} placeholder="e.g. Review firewall config Friday 11am high priority #work" /></Card>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin" role="group" aria-label="Task views">
        {VIEWS.map((v) => (
          <Chip key={v.id} active={view === v.id} onClick={() => setView(v.id)}>{v.label}</Chip>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <label className="relative col-span-2 sm:col-span-1">
          <span className="sr-only">Search tasks</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" className={`${inputClass} pl-9`} />
        </label>
        <label>
          <span className="sr-only">Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputClass}>
            <option value="">Any priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Project</span>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className={inputClass}>
            <option value="">All projects</option>
            {projects.data?.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>

      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {loading && !data ? <Loading /> : null}
      {data && data.tasks.length === 0 ? (
        <Empty title={debounced ? 'No matching tasks' : view === 'done' ? 'Nothing completed yet' : 'All clear'} body={view === 'today' ? 'Nothing due today. Use quick add above to plan something.' : undefined} />
      ) : null}

      <div className="flex flex-col gap-4">
        {groups.map(([day, tasks]) => (
          <Card key={day}>
            <h2 className="eyebrow mb-1">{day}</h2>
            <ul>
              {tasks.map((t) => <TaskItem key={t.id} task={t} timezone={prefs?.timezone} onChange={reload} onOpen={setEditing} showDelete />)}
            </ul>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <h2 className="mb-2 text-base font-semibold">Projects</h2>
        <form onSubmit={(e) => void addProject.run(e)} className="flex gap-2">
          <label className="sr-only" htmlFor="new-project">New project name</label>
          <input id="new-project" value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="New project" maxLength={80} className={inputClass} />
          <Button type="submit" pending={addProject.pending} disabled={!newProject.trim()}><Plus className="size-4" aria-hidden /> Add</Button>
        </form>
        {addProject.error ? <div className="mt-2"><ErrorNote message={addProject.error} /></div> : null}
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {projects.data?.projects.map((p) => (
            <li key={p.id} className="flex items-center gap-1 rounded-full border border-line pl-3">
              {p.name}
              <IconButton
                label={`Delete project ${p.name}`}
                onClick={async () => {
                  if (!window.confirm(`Delete project "${p.name}"? Tasks stay, without a project.`)) return;
                  await api.del(`/projects/${p.id}`).catch(() => undefined);
                  projects.reload();
                }}
              >
                <X className="size-4" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      </Card>

      {editing ? <TaskEditor task={editing} projects={projects.data?.projects ?? []} onClose={() => setEditing(null)} onSaved={reload} /> : null}
    </div>
  );
}
