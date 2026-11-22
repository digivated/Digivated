import { createElement } from 'react';
import GlareHover from '../react-bits/GlareHover';
import GradientText from '../react-bits/GradientText';
import StarBorder from '../react-bits/StarBorder';

function Headline() {
  return (
    <h1 id="dg-home-title">
      Find what’s <GradientText colors={['#3d5146', '#647467', '#283a32']} animationSpeed={12} scale={1.4}>next.</GradientText>
    </h1>
  );
}

function BrowseAction() {
  return (
    <StarBorder
      as="a"
      href="#this-week"
      className="dg-btn dg-btn-primary dg-preview-browse"
      radius={11}
      thickness={1}
      stars={1}
      glow={0.25}
      duration={6}
      hover="reveal"
      backgroundColor="#252c27"
      textColor="#ffffff"
      borderColor="#47534a"
      color="#e1efe4"
      trailColor="#94aa98"
    >
      Browse launches
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M4 12h15m-6-6 6 6-6 6" />
      </svg>
    </StarBorder>
  );
}

function LaunchArt() {
  return (
    <GlareHover
      className="dg-preview-art"
      width="100%"
      height="100%"
      background="#1d2420"
      borderColor="#48574d"
      borderRadius="20px"
      glareColor="#d6e8da"
      glareOpacity={0.22}
      glareAngle={-52}
      glareSize={46}
      softness={0.8}
      variant="sheen"
      transitionDuration={1050}
    >
      <span className="dg-preview-orbit" aria-hidden="true">
        <span className="dg-preview-orbit-ring" />
        <span className="dg-preview-orbit-ring" />
        <span className="dg-preview-orbit-ring" />
        <span className="dg-preview-orbit-core" />
      </span>
    </GlareHover>
  );
}

export const launchEffects = { headline: Headline, action: BrowseAction, art: LaunchArt };

export function launchEffect(name: keyof typeof launchEffects) {
  return createElement(launchEffects[name]);
}
