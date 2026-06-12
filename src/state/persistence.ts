/* ------------------------------------------------------------------ *
 * localStorage persistence for the Project. Saves are debounced. The
 * blueprint image is embedded as a data URL so a reload fully restores
 * the session (image + trace + measurements + phase).
 * ------------------------------------------------------------------ */

import { type Project, SCHEMA_VERSION, emptyProject } from './types.ts';

const KEY = 'wtrm:project:v1';

export function loadProject(): Project | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Project;
    return migrate(data);
  } catch (err) {
    console.warn('Failed to load saved project; starting fresh.', err);
    return null;
  }
}

/** Bring older saved shapes up to the current schema. */
function migrate(data: Project): Project {
  if (!data || typeof data !== 'object') return emptyProject();
  if (data.schemaVersion === SCHEMA_VERSION) return data;
  // Only one schema version exists today; merge onto defaults defensively.
  return { ...emptyProject(), ...data, schemaVersion: SCHEMA_VERSION };
}

let timer: number | undefined;
export function saveProjectDebounced(project: Project, ms = 300): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => saveProject(project), ms);
}

export function saveProject(project: Project): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(project));
  } catch (err) {
    // Most likely the embedded image pushed us over the ~5MB quota.
    console.warn('Could not persist project (storage full?).', err);
  }
}

export function clearProject(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
