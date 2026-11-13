import test from 'node:test';
import assert from 'node:assert/strict';
import { homeLaunchGroups } from '../src/lib/home-launches.mjs';
const now=Date.parse('2026-11-13T12:00:00Z');
const p=(id,date,votes={})=>({id,name:id,pageUrl:'/projects/listing/'+id,date,votes});
test('homepage has disjoint current, previous and archive cohorts; future excluded',()=>{
 const current=p('current','2026-11-09'),previous=p('previous','2026-11-02'),older=p('old','2026-11-01');
 const g=homeLaunchGroups([current,previous,older,current,p('future','2026-11-16'),p('invalid','bad')],now);
 assert.deepEqual(g.current.map(p=>p.id),['current']);assert.deepEqual(g.previous.map(p=>p.id),['previous']);assert.deepEqual(g.archive.map(p=>p.id),['old']);
});
test('current ranks weekly votes, previous ranks all-time; publication controls cohort',()=>{
 const g=homeLaunchGroups([p('a','2026-11-10',{weekly:1,all:30}),p('b','2026-11-09',{weekly:5,all:5}),p('c','2026-11-07',{all:2}),p('d','2026-11-06',{all:9}),{...p('e','2026-10-01'),publishedAt:'2026-11-11'}],now);
 assert.deepEqual(g.current.map(p=>p.id),['b','a','e']);assert.deepEqual(g.previous.map(p=>p.id),['d','c']);assert.equal(g.archive.length,0);
});
test('empty and incomplete collections do not create broken links',()=>{
 assert.deepEqual(homeLaunchGroups([{id:'missing-page',name:'No link'}],now),{current:[],previous:[],archive:[]});
});
