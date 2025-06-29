import './style.css';
import { Clerk } from '@clerk/clerk-js';

// --- CONFIGURATION & DOM ELEMENTS ---
const API_URL = import.meta.env.VITE_API_URL;
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const appDiv = document.querySelector('#app');
const authDiv = document.querySelector('#auth-section');

if (!CLERK_PUBLISHABLE_KEY) {
    throw new Error("Missing Clerk Publishable Key. Please set VITE_CLERK_PUBLISHABLE_KEY in .env.local");
}
const clerk = new Clerk(CLERK_PUBLISHABLE_KEY);

// --- API HELPER (NOW WITH AUTH TOKEN) ---
async function fetchFromApi(endpoint) {
    const token = await clerk.session.getToken();
    const response = await fetch(`${API_URL}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `API responded with status ${response.status}` }));
        throw new Error(errorData.error || `An unknown API error occurred.`);
    }
    return response.json();
}

// --- UI RENDERING FUNCTIONS ---
function renderSignedInUI(user) {
    const userMenuContainer = document.createElement('div');
    userMenuContainer.id = 'user-menu-container';

    const userButton = document.createElement('button');
    userButton.id = 'user-menu-button';
    userButton.innerHTML = `<img src="${user.imageUrl}" alt="${user.fullName || 'User menu'}">`;

    const dropdown = document.createElement('div');
    dropdown.id = 'user-menu-dropdown';
    dropdown.innerHTML = `
        <button id="profile-btn">Manage Account</button>
        <button id="signout-btn">Sign Out</button>
    `;

    userMenuContainer.appendChild(userButton);
    userMenuContainer.appendChild(dropdown);
    authDiv.innerHTML = '';
    authDiv.appendChild(userMenuContainer);

    // Event Listeners for the dropdown
    userButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    });

    document.getElementById('profile-btn').addEventListener('click', () => clerk.openUserProfile());
    document.getElementById('signout-btn').addEventListener('click', () => clerk.signOut());
}

function renderSignedOutUI() {
    const signInButton = document.createElement('button');
    signInButton.id = 'signin-btn';
    signInButton.className = 'revision-btn';
    signInButton.textContent = 'Sign In / Sign Up';
    signInButton.addEventListener('click', () => clerk.openSignIn());

    authDiv.innerHTML = '';
    authDiv.appendChild(signInButton);
    appDiv.innerHTML = '<h2>Welcome to the Parel Agency Portal.</h2><p>Please sign in to continue.</p>';
}


async function handleRouteChange() {
    const path = window.location.pathname;
    appDiv.innerHTML = `<p><i>Loading...</i></p>`;
    if (path.startsWith('/project/')) {
        const projectId = path.split('/')[2];
        await renderProjectDetailPage(projectId);
    } else {
        await renderProjectListPage();
    }
}

async function renderProjectListPage() {
    try {
        const projects = await fetchFromApi('/projects');
        let projectsHtml = '<h2>My Projects</h2>';
        if (projects.length === 0) {
            projectsHtml += '<p>You have not been associated with any projects yet.</p>';
        } else {
            projectsHtml += projects.map(p => `
                <div class="asset">
                    <div class="asset-title"><a href="/project/${p.id}">${p.name}</a></div>
                    <div><strong>ID:</strong> <code>${p.id}</code></div>
                    <div><strong>Status:</strong> ${p.status}</div>
                </div>
            `).join('');
        }
        appDiv.innerHTML = projectsHtml;
    } catch (error) {
        appDiv.innerHTML = `<h2 style="color: red;">Failed to load projects</h2><p>${error.message}</p>`;
    }
}

async function renderProjectDetailPage(projectId) {
    try {
        const project = await fetchFromApi(`/project/${projectId}`);
        const managerTag = project.assignedManager ? project.assignedManager.tag : 'Not Assigned';

        let assetsHtml = 'No assets defined in masterplan.';
        if (project.masterplan && project.masterplan.requiredAssets && project.masterplan.requiredAssets.length > 0) {
            assetsHtml = project.masterplan.requiredAssets.map(asset => {
                const isCompleted = asset.status === 'Completed';
                const statusClass = isCompleted ? 'status-completed' : 'status-pending';
                const statusText = isCompleted ? 'Completed' : 'Pending';

                let contentHtml = '';
                if (isCompleted && asset.generatedContent) {
                    if (asset.type === 'copy') {
                        contentHtml = `<pre class="asset-content">${asset.generatedContent.replace(/</g, "&lt;")}</pre>`;
                    } else if (asset.type === 'image' && asset.generatedContent.startsWith('http')) {
                        contentHtml = `<img src="${asset.generatedContent}" alt="${asset.description}" class="asset-image">`;
                    }
                }

                return `
                    <div class="asset-card">
                        <button class="asset-header" ${!isCompleted ? 'disabled' : ''}>
                            <span class="asset-title">${asset.description || ''}</span>
                            <span class="asset-status ${statusClass}">${statusText}</span>
                        </button>
                        <div class="asset-body" style="display: none;">
                            ${contentHtml}
                        </div>
                    </div>
                `;
            }).join('');
        }

        appDiv.innerHTML = `
            <p><a href="/">&larr; Back to Project Dashboard</a></p>
            <h1>${project.name || 'Project'}</h1>
            <div id="details">
                <p><strong>ID:</strong> <code>${project.id}</code></p>
                <p><strong>Status:</strong> ${project.status || 'N/A'}</p>
                <p><strong>Project Lead:</strong> ${managerTag}</p>
            </div>
            <h3>Generated Assets</h3>
            <div id="assets-container">${assetsHtml}</div>
        `;

        // Add event listeners for the new accordion-style assets
        document.querySelectorAll('.asset-header').forEach(header => {
            header.addEventListener('click', () => {
                const body = header.nextElementSibling;
                if (body.style.display === 'block') {
                    body.style.display = 'none';
                } else {
                    body.style.display = 'block';
                }
            });
        });

    } catch (error) {
        console.error('Failed to load project details:', error);
        appDiv.innerHTML = `<h2 style="color: red;">Failed to Load Project</h2><p>${error.message}</p>`;
    }
}

// --- MAIN APPLICATION START ---
async function startApp() {
    await clerk.load();

    clerk.addListener(({ user }) => {
        if (user) {
            renderSignedInUI(user);
            handleRouteChange();
        } else {
            renderSignedOutUI();
        }
    });

    // Listen for URL changes to handle navigation in our SPA
    window.addEventListener('popstate', handleRouteChange);
    document.body.addEventListener('click', e => {
        // Intercept clicks on local links to prevent full page reloads
        if (e.target.matches('a') && e.target.href.startsWith(window.location.origin)) {
            e.preventDefault();
            window.history.pushState({}, '', e.target.href);
            handleRouteChange();
        }
    });
}

startApp();