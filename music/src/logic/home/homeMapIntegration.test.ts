import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const source = (file: string) => readFileSync(resolve(process.cwd(), '../wall', file), 'utf8');
function fixture(context: 'standalone' | 'embedded' | 'home', query?: string) {
  const handlers: Record<string, () => void> = {};
  const clicks: Record<string, (event: { preventDefault(): void }) => void> = {};
  const ready = vi.fn(() => true), requestNavigate = vi.fn(() => true);
  let mapReady = () => {};
  const link = { id: '', className: '', href: '', textContent: '', style: { cssText: '' }, setAttribute: vi.fn(), addEventListener: (event: string, fn: typeof clicks[string]) => { clicks[event] = fn; } };
  const doc = { documentElement: { dataset: {} }, addEventListener: (event: string, fn: () => void) => { handlers[event] = fn; }, getElementById: () => null, createElement: () => link, body: { appendChild: vi.fn() } };
  const win: Record<string, any> = { document: doc, location: { origin: 'http://local', href: 'http://local/wall-app/', pathname: '/wall-app/', search: query ?? (context === 'home' ? '?host=home&homeRuntime=session&homeNavigation=4' : '') }, SBE: { MapboxViewportRuntime: { onReady: (fn: () => void) => { mapReady = fn; } } } };
  win.parent = context === 'standalone' ? win : { location: { origin: 'http://local' }, StudioRichHome: { version: 1, ready, requestNavigate } };
  const run = (file: string) => runInNewContext(source(file), { window: win, URL, URLSearchParams, console });
  run('systems/runtime/WosEndpointGuard.js');
  return { win, doc, ready, requestNavigate, handlers, clicks, link, run, mapReady: () => mapReady() };
}

describe('HOME / MAP adapter', () => {
  it.each([['standalone', 'wall_standalone'], ['embedded', 'wall_embedded'], ['home', 'wall_home']] as const)('distinguishes %s', (context, role) => {
    const f = fixture(context); expect(f.win.SBE.WosEndpointRole.role).toBe(role);
  });
  it.each(['?host=home', '?host=home&homeRuntime=s&homeNavigation=0', '?host=home&homeRuntime=s&homeNavigation=NaN'])('rejects incomplete identity %s', query => {
    expect(fixture('embedded', query).win.SBE.WosEndpointGuard.isHome).toBe(false);
  });
  it('waits for real viewport readiness and reports once with requested identity', () => {
    const f = fixture('home'); f.run('systems/presentation/homeMapSurface.js');
    expect(f.ready).not.toHaveBeenCalled(); f.handlers.DOMContentLoaded();
    expect(f.ready).not.toHaveBeenCalled(); f.mapReady(); f.mapReady();
    expect(f.ready).toHaveBeenCalledExactlyOnceWith(f.doc, { runtimeId: 'session', navigationId: 4, routeKey: 'surface=map' });
    expect(f.requestNavigate).not.toHaveBeenCalled();
  });
  it('delegates hosted BLACKBOOK click to HOME without native child navigation', () => {
    const f = fixture('home'); f.run('systems/presentation/homeMapSurface.js'); f.run('systems/presentation/subwayBlackbookNavLink.js');
    const preventDefault = vi.fn(); f.clicks.click({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(f.requestNavigate).toHaveBeenCalledExactlyOnceWith(f.doc, f.win.SBE.WosEndpointGuard.homeIdentity, { surface: 'blackbook' });
  });
  it.each(['standalone', 'embedded'] as const)('preserves native BLACKBOOK anchor in %s', context => {
    const f = fixture(context); f.run('systems/presentation/homeMapSurface.js'); f.run('systems/presentation/subwayBlackbookNavLink.js');
    expect(f.link.href).toBe('http://local/blackbook.html'); expect(f.clicks.click).toBeUndefined();
    expect(f.win.SBE.HomeMapSurface).toBeUndefined(); expect(f.ready).not.toHaveBeenCalled();
  });
});
