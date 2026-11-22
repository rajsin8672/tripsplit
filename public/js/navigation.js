/**
 * Navigation module for handling responsive menu and dynamic auth states
 */

import { onAuthChange, logoutUser } from './auth.js';
import { setApiAuthUser } from './api.js';

export function setupNavigation() {
  const mobileToggle = document.getElementById('mobile-menu-toggle');
  const navLinks = document.getElementById('nav-links');

  if (mobileToggle && navLinks) {
    if (mobileToggle.dataset.navBound === 'true') return;
    mobileToggle.dataset.navBound = 'true';

    // Ensure backdrop exists
    let backdrop = document.getElementById('nav-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'nav-backdrop';
      backdrop.className = 'nav-backdrop';
      document.body.appendChild(backdrop);
    }

    const toggleMenu = (openState) => {
      const willOpen = typeof openState === 'boolean' ? openState : !navLinks.classList.contains('is-open');
      if (willOpen) {
        navLinks.classList.add('is-open');
        mobileToggle.classList.add('is-active');
        mobileToggle.setAttribute('aria-expanded', 'true');
        backdrop.classList.add('is-active');
        document.body.style.overflow = 'hidden';
      } else {
        navLinks.classList.remove('is-open');
        mobileToggle.classList.remove('is-active');
        mobileToggle.setAttribute('aria-expanded', 'false');
        backdrop.classList.remove('is-active');
        document.body.style.overflow = '';
      }
    };

    let isToggling = false;
    const handleToggle = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (isToggling) return;
      isToggling = true;
      toggleMenu();
      setTimeout(() => { isToggling = false; }, 250);
    };

    mobileToggle.addEventListener('click', handleToggle);
    mobileToggle.addEventListener('touchend', handleToggle, { passive: false });

    backdrop.addEventListener('click', () => toggleMenu(false));
    backdrop.addEventListener('touchend', (e) => {
      e.preventDefault();
      toggleMenu(false);
    }, { passive: false });

    // Close menu when tapping any nav link or button inside nav
    navLinks.addEventListener('click', (e) => {
      const target = e.target.closest('a') || e.target.closest('button');
      if (target) {
        toggleMenu(false);
      }
    });

    // Close menu when tapping outside
    const handleOutside = (e) => {
      if (navLinks.classList.contains('is-open') && !navLinks.contains(e.target) && !mobileToggle.contains(e.target)) {
        toggleMenu(false);
      }
    };
    document.addEventListener('click', handleOutside);
    document.addEventListener('touchend', handleOutside, { passive: true });

    // Close on Escape key press
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navLinks.classList.contains('is-open')) {
        toggleMenu(false);
      }
    });
  }

  // Handle Dynamic Auth Buttons in Navbar
  const navAuthContainer = document.getElementById('nav-auth-container');
  const navLinksUl = document.getElementById('nav-links');

  onAuthChange(async (user) => {
    setApiAuthUser(user);
    const currentPath = window.location.pathname;

    let isAdmin = false;
    if (user) {
      try {
        const checkRes = await api.get('/api/admin/check');
        isAdmin = Boolean(checkRes?.data?.isAdmin);
      } catch {}
    }

    // Add Admin link to nav-links list if user is admin
    if (navLinksUl && isAdmin && !document.getElementById('nav-admin-item')) {
      const adminLi = document.createElement('li');
      adminLi.id = 'nav-admin-item';
      adminLi.innerHTML = `
        <a href="/admin.html" class="nav-link ${currentPath.includes('admin') ? 'active' : ''}">
          <span style="background: linear-gradient(135deg, #03045E 0%, #0077B6 100%); color: #CAF0F8; font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.04em;">Admin</span>
        </a>
      `;
      // Insert before logout button
      const logoutGroup = navLinksUl.querySelector('.nav-auth-group');
      if (logoutGroup) {
        navLinksUl.insertBefore(adminLi, logoutGroup);
      } else {
        navLinksUl.appendChild(adminLi);
      }
    }

    if (navAuthContainer) {
      if (user) {
        navAuthContainer.innerHTML = `
          <a href="/dashboard.html" class="nav-link ${currentPath.includes('dashboard') ? 'active' : ''}" id="nav-dashboard">Dashboard</a>
          <a href="/payments.html" class="nav-link ${currentPath.includes('payments') ? 'active' : ''}" id="nav-payments">Payments</a>
          <a href="/profile.html" class="nav-link ${currentPath.includes('profile') ? 'active' : ''}" id="nav-profile">Profile</a>
          ${isAdmin ? `<a href="/admin.html" class="nav-link ${currentPath.includes('admin') ? 'active' : ''}" id="nav-admin"><span style="background: linear-gradient(135deg, #03045E 0%, #0077B6 100%); color: #CAF0F8; font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 9999px;">Admin</span></a>` : ''}
          <button type="button" class="btn btn-outline btn-sm" id="nav-logout-btn">Log Out</button>
        `;

        const logoutBtn = document.getElementById('nav-logout-btn');
        if (logoutBtn) {
          logoutBtn.addEventListener('click', async () => {
            try {
              await logoutUser();
              window.location.href = '/index.html';
            } catch (err) {
              console.error('Logout error:', err);
              window.location.href = '/login.html';
            }
          });
        }
      } else {
        navAuthContainer.innerHTML = `
          <a href="/login.html" class="nav-link ${currentPath.includes('login') ? 'active' : ''}" id="nav-login">Login</a>
          <a href="/register.html" class="btn btn-primary btn-sm" id="nav-register">Register</a>
        `;
      }
    }
  });
}

// Automatically setup navigation on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupNavigation);
} else {
  setupNavigation();
}
