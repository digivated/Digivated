import { iconStrokes } from '../../lib/card-icons.mjs';
import LineSidebar from './LineSidebar.jsx';
import GlareHover from './GlareHover.jsx';

function Icon({ name, size = 17 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconStrokes[name] || iconStrokes.arrow }} />;
}

export function RailLinks({ groups }) {
  return (
    <nav className="dg-rail-navigation" aria-label="Workspace navigation">
      {groups.map(({ label, links }) => (
        <div className="dg-rail-group" key={label}>
          {label && <h2>{label}</h2>}
          <LineSidebar
            as="div"
            items={links.map(link => link.label)}
            defaultActive={links.findIndex(link => link.current)}
            showIndex={false}
            showMarker
            markerLength={9}
            markerGap={4}
            scaleTick={false}
            itemGap={3}
            markerColor="#737373"
            textColor="#e6e6e6"
            accentColor="#fff"
            proximityRadius={56}
            maxShift={3}
            smoothing={85}
            renderItem={(label, index) => {
              const link = links[index];
              return (
                <a href={link.href} aria-current={link.current ? 'page' : undefined}>
                  <span className="line-sidebar__label"><Icon name={link.icon} /><span>{label}</span></span>
                </a>
              );
            }}
          />
        </div>
      ))}
    </nav>
  );
}

export function GlassAction({ label, icon, light = false, href, ...attributes }) {
  return (
    <GlareHover
      as={href ? 'a' : 'button'}
      {...(href ? { href } : { type: 'submit' })}
      {...attributes}
      borderRadius="12px"
      transitionDuration={440}
      playOnce
      variant="sheen"
      blendMode={light ? 'multiply' : 'screen'}
      glareColor={light ? '#8c8c8c' : '#fff'}
      glareOpacity={light ? .23 : .34}
    >
      <span className="dg-glass-action-label">
        {icon === 'upload' && <Icon name={icon} />}
        {label}
        {icon && icon !== 'upload' && <Icon name={icon} size={16} />}
      </span>
    </GlareHover>
  );
}

export const surfaces = { RailLinks, GlassAction };
