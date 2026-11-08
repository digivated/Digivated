import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCategory, aiTopics} from '../src/lib/project-taxonomy.mjs';
import {projectPublic} from '../server/admin-store.mjs';
test('reviewed category corrections preserve source records and later owner edits',()=>{
 const record={id:'4aeaf5cf-82a1-4529-a828-f3a0567e8024',category:'Apps'};
 assert.equal(projectCategory(record),'Education');assert.equal(record.category,'Apps');
 assert.equal(projectCategory({...record,category:'Productivity'}),'Productivity');
 assert.equal(projectCategory({}),'Other');
});
test('AI categories distinguish directories, security, video and non-AI projects',()=>{
 assert.deepEqual(aiTopics({id:'da7df430-bf8d-4f15-8b20-79fad9dc498e'}),['AI directories']);
 assert.deepEqual(aiTopics({id:'9e2e2852-7c52-4822-a4c5-b38827c3bc98'}),['Coding']);
 assert.deepEqual(aiTopics({id:'daf77018-7d73-4753-a24c-539ed2f80f4d'}),['Video']);
 assert.deepEqual(aiTopics({name:'Studio',category:'Design',description:'Edit photos. AI research tools are mentioned in our blog.'}),[]);
 assert.deepEqual(aiTopics({name:'Video AI',category:'AI',description:'Generate video. Includes marketing examples.'}),['Video']);
});
test('public project projection applies the same reviewed category',()=>{
 const result=projectPublic({id:'4aeaf5cf-82a1-4529-a828-f3a0567e8024',category:'Apps',status:'approved',consent:true,url:'https://example.com',image:'image'});
 assert.equal(result.category,'Education');
});
