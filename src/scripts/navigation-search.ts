import { createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { NavigationSearch } from '../components/ui/navigation-search';

const search = document.querySelector<HTMLElement>('[data-glass-search-root]');
if (search) hydrateRoot(search, createElement(NavigationSearch));
