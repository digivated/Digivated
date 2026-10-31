import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {adjacentProject,uniqueProjects} from '../src/scripts/wall-catalog.js';

test('wall catalog deduplicates overlapping pages and keeps featured projects first',()=>{
 const catalog=uniqueProjects([
  {id:'a',name:'Alpha',status:'approved'},
  {id:'b',name:'Beta',status:'featured'},
  {id:'a',name:'Alpha duplicate',status:'approved'},
  {id:'c',name:'Gamma',status:'approved'},
  {id:'',name:'Invalid'},
 ]);
 assert.deepEqual(catalog.map(project=>project.id),['b','a','c']);
 assert.equal(catalog[1].name,'Alpha');
});

test('project navigation follows IDs after new projects arrive and stops at both ends',()=>{
 const first=uniqueProjects([{id:'a',name:'A'},{id:'b',name:'B'}]);
 assert.equal(adjacentProject(first,'a',1),'b');
 const loaded=uniqueProjects([...first,{id:'featured',name:'Featured',status:'featured'}]);
 assert.equal(adjacentProject(loaded,'a',1),'b');
 assert.equal(adjacentProject(loaded,'a',-1),'featured');
 assert.equal(adjacentProject(loaded,'featured',-1),'featured');
 assert.equal(adjacentProject(loaded,'b',1),'b');
 assert.equal(adjacentProject([],null,1),null);
});
