import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => fs.readFileSync(new URL('../'+path, import.meta.url),'utf8');
test('the talent hub offers one schedules entry with independent programming and followup URLs',()=>{
  const hub=read('app/dashboard/talento-humano/page.tsx');
  assert.equal((hub.match(/href: "\/dashboard\/talento-humano\/(rutas|mallas)"/g)||[]).length,1);
  assert.match(hub,/title: "Horarios y mallas"/);
  const page=read('app/dashboard/talento-humano/rutas/page.tsx');
  assert.match(page,/aria-label="Vistas de horarios y mallas"/);
  assert.match(page,/aria-current=\{!onMallasPath \? "page" : undefined\}/);
  assert.match(page,/aria-current=\{onMallasPath \? "page" : undefined\}/);
  assert.match(read('app/dashboard/talento-humano/mallas/page.tsx'),/from "\.\.\/rutas\/page"/);
});
test('planning actions including the mobile create bar belong to programming',()=>{
  const page=read('app/dashboard/talento-humano/rutas/page.tsx');
  assert.match(page,/mounted && !onMallasPath \? createPortal/);
  assert.match(page,/!onMallasPath \? <><button[^\n]+openEditModal\(selectedRoute\)/);
  assert.match(page,/!onMallasPath \? <><button[^\n]+openEditModal\(route\)/);
  assert.match(page,/!onMallasPath \? <button[^\n]+openCreateModal\(\)/);
  assert.match(read('components/shell/MobileNav.tsx'),/pathname.startsWith\("\/dashboard\/talento-humano\/mallas"\)/);
});
test('search keeps scheduling and geographic map as distinct functions',()=>{
  const source=read('lib/moduleFunctions.ts');
  assert.match(source,/id: "fn-hr-rutas", label: "Horarios y mallas"/);
  assert.match(source,/id: "fn-hr-mapa", label: "Ver mapa operativo"/);
});
