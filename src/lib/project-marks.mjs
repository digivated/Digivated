// The labels that travel with a project: same words on the homepage, directory,
// rankings, creator page, and project page.
export function projectMarks(project) {
  if (!project || typeof project !== 'object') return [];
  const marks = [];
  if (project.status === 'featured' || project.featured === true || project.member === true) marks.push('member');
  else if (project.sponsored) marks.push('spot');
  if (project.fresh) marks.push('fresh');
  else if (Number(project.rising) > 0) marks.push('rising');
  return marks;
}

export const PROJECT_MARK_LABEL = Object.freeze({
  member: 'Pro',
  spot: 'Spot',
  fresh: 'New this week',
  rising: 'Rising',
});
