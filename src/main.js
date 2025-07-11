import './style.css';
import { Clerk } from '@clerk/clerk-js';
const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;
const DISCORD_REDIRECT_URI = import.meta.env.VITE_DISCORD_REDIRECT_URI;

// --- NOTIFICATION SYSTEM ---
function showNotification(message, type = 'success') {
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        document.body.appendChild(container);
    }
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    const icon = type === 'success' ? '✓' : '✖';
    notification.innerHTML = `<span class="notification-icon">${icon}</span> <div>${message}</div>`;
    container.appendChild(notification);
    setTimeout(() => { notification.classList.add('show'); }, 10);
    setTimeout(() => {
        notification.classList.remove('show');
        notification.addEventListener('transitionend', () => notification.remove());
    }, 5000);
}

// --- CONFIGURATION & DOM ELEMENTS ---
const API_URL = import.meta.env.VITE_API_URL;
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const appDiv = document.querySelector('#app');
const authDiv = document.querySelector('#auth-section');

if (!CLERK_PUBLISHABLE_KEY) {
    throw new Error("Missing Clerk Publishable Key in .env.local");
}
const clerk = new Clerk(CLERK_PUBLISHABLE_KEY);

// --- GLOBAL STATE & ROUTER ---
let currentPath = window.location.pathname;

// --- API HELPER ---
async function fetchFromApi(endpoint, options = {}) {
    const token = await clerk.session?.getToken();
    if (!token) {
        showNotification("Authentication error. Please sign in again.", "error");
        return null;
    }
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            ...options
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `API responded with status ${response.status}` }));
            throw new Error(errorData.error || `An unknown API error occurred.`);
        }
        return response.json();
    } catch (error) {
        console.error("API Fetch Error:", error);
        showNotification(error.message, "error");
        return null;
    }
}

// --- UI & PAGE RENDERERS ---
async function renderAuthUI(user) {
    if (user) {
        const linkStatus = await fetchFromApi('/auth/discord-link-status');
        const isDiscordLinked = linkStatus ? linkStatus.isLinked : false;

        let dropdownItems = `<button id="profile-btn">Manage Account</button>`;
        if (!isDiscordLinked) {
            dropdownItems += `<button id="discord-link-btn" class="action-btn">Connect Discord</button>`;
        }
        dropdownItems += `<button id="signout-btn">Sign Out</button>`;

        authDiv.innerHTML = `
            <div id="user-menu-container">
                <button id="user-menu-button"><img src="${user.imageUrl}" alt="${user.fullName || 'User menu'}"></button>
                <div id="user-menu-dropdown" style="display: none;">${dropdownItems}</div>
            </div>`;

        document.getElementById('user-menu-button').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('user-menu-dropdown').style.display = 'block'; });
        document.getElementById('profile-btn').addEventListener('click', () => clerk.openUserProfile());
        document.getElementById('signout-btn').addEventListener('click', () => clerk.signOut());

        if (!isDiscordLinked) {
            document.getElementById('discord-link-btn').addEventListener('click', () => {
                // Clerk's native function to link an account
                const redirectUrl = window.location.href; // We komen hier terug na de flow
                clerk.user.createExternalAccount({
                    strategy: 'oauth_discord',
                    redirectUrl: redirectUrl,
                    additionalScopes: [],
                });
            });
        }
    } else {
        authDiv.innerHTML = `<button id="signin-btn" class="action-btn">Sign In</button>`;
        document.getElementById('signin-btn').addEventListener('click', () => clerk.openSignIn());
    }
}

async function renderProjectListPage() {
    try {
        const projects = await fetchFromApi('/projects');
        if (projects === null) {
            appDiv.innerHTML = `<h2>Error</h2><p>Could not load projects. Your session might have expired.</p>`;
            return;
        }
        let projectsHtml = `
            <div class="page-header">
                <h2>My Projects</h2>
                <a href="/new-project" class="action-btn">+ Create New Project</a>
            </div>`;
        if (projects.length === 0) {
            projectsHtml += '<p>You have not been associated with any projects yet.</p>';
        } else {
            projectsHtml += projects.map(p => `
                <div class="project-card">
                    <h3 class="project-card-title"><a href="/project/${p.id}">${p.name}</a></h3>
                    <p><strong>Status:</strong> ${p.status}</p>
                </div>
            `).join('');
        }
        appDiv.innerHTML = projectsHtml;
    } catch (error) {
        appDiv.innerHTML = `<h2 style="color: red;">Failed to load projects</h2><p>${error.message}</p>`;
    }
}

function renderNewProjectForm() {
    appDiv.innerHTML = `
        <p><a href="/">&larr; Back to Project Dashboard</a></p>
        <h2>Start a New "Brand-in-a-Box" Project</h2>
        <form id="new-project-form">
            <div class="form-group"><label for="projectName">Project / Company Name</label><input type="text" id="projectName" required placeholder="e.g., BioScan App Launch"></div>
            <div class="form-group"><label for="targetAudience">Describe your Target Audience</label><textarea id="targetAudience" rows="4" required placeholder="e.g., Young professionals..."></textarea></div>
            <div class="form-group"><label for="coreValues">What are the Core Values of your brand?</label><textarea id="coreValues" rows="4" required placeholder="e.g., Innovation, Community..."></textarea></div>
            <button type="submit" class="action-btn">Generate My Brand-in-a-Box</button>
        </form>
    `;
}

async function renderProjectDetailPage(projectId) {
    try {
        const project = await fetchFromApi(`/project/${projectId}`);
        if(project === null) return;

        const managerTag = project.assignedManager ? JSON.parse(project.assignedManager).tag : 'Not Assigned';

        let assetsHtml = 'No assets defined in masterplan.';
        if (project.masterplan && project.masterplan.requiredAssets && project.masterplan.requiredAssets.length > 0) {
            assetsHtml = project.masterplan.requiredAssets.map((asset, index) => {
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
                        <button class="asset-header" data-target="asset-body-${index}" ${isCompleted ? '' : 'disabled'}>
                            <span class="asset-title">${asset.description || ''}</span>
                            <span class="asset-status ${statusClass}">${statusText}</span>
                        </button>
                        <div id="asset-body-${index}" class="asset-body" style="display: none;">
                            ${contentHtml}
                        </div>
                    </div>
                `;
            }).join('');
        }

        appDiv.innerHTML = `
            <p><a href="/">&larr; Back to Project Dashboard</a></p>
            <h1>${project.name || 'Project'}</h1>
            <div id="details"><p><strong>ID:</strong> <code>${project.id}</code></p><p><strong>Status:</strong> ${project.status || 'N/A'}</p><p><strong>Project Lead:</strong> ${managerTag}</p></div>
            <h3>Generated Assets</h3>
            <div id="assets-container">${assetsHtml}</div>
        `;

        // Add event listeners for the new accordion-style assets
        document.querySelectorAll('.asset-header').forEach(header => {
            header.addEventListener('click', () => {
                const body = header.nextElementSibling;
                if (body) {
                    body.style.display = body.style.display === 'block' ? 'none' : 'block';
                }
            });
        });

    } catch (error) {
        console.error('Failed to load project details:', error);
        appDiv.innerHTML = `<h2 style="color: red;">Failed to Load Project</h2><p>${error.message}</p>`;
    }
}

// In client-portal/main.js
async function handleFormSubmit(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating...';

    try {
        const projectData = {
            projectName: document.getElementById('projectName').value,
            targetAudience: document.getElementById('targetAudience').value,
            coreValues: document.getElementById('coreValues').value,
        };

        // fetchFromApi will throw an error if the response is not OK
        const result = await fetchFromApi('/projects', {
            method: 'POST',
            body: JSON.stringify(projectData)
        });

        // --- DEFENSIVE CHECK ---
        // This code only runs if the API call was successful
        if (result && result.projectId) {
            showNotification(`Project created successfully! The Parels will now generate a masterplan.`, 'success');
            setTimeout(() => {
                currentPath = `/project/${result.projectId}`;
                window.history.pushState({}, '', currentPath);
                router();
            }, 1500);
        } else {
            // This case handles if the API returns a success status but an unexpected body
            throw new Error("Received an invalid response from the server.");
        }

    } catch (error) {
        // The fetchFromApi helper or our own logic threw an error
        showNotification(`Failed to create project: ${error.message}`, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Generate My Brand-in-a-Box';
    }
}

// --- THE ROUTER (The brain of the app) ---
async function router() {
    appDiv.innerHTML = `<p><i>Loading...</i></p>`;
    if (!clerk.user) {
        renderAuthUI(null); // Render sign-in button
        appDiv.innerHTML = '<h2>Welcome to the Parel Agency Portal.</h2><p>Please sign in to continue.</p>';
        return;
    }
    // If we are here, the user is logged in.
    if (currentPath.startsWith('/project/')) {
        await renderProjectDetailPage(currentPath.split('/')[2]);
    } else if (currentPath === '/new-project') {
        renderNewProjectForm();
    } else {
        await renderProjectListPage();
    }
}

// --- APP INITIALIZATION ---
async function startApp() {
    // 1. Setup persistent event listeners
    window.addEventListener('popstate', () => {
        currentPath = window.location.pathname;
        router();
    });
    document.body.addEventListener('click', e => {
        const anchor = e.target.closest('a');
        if (anchor && anchor.getAttribute('href')?.startsWith('/')) {
            e.preventDefault();
            currentPath = anchor.getAttribute('href');
            window.history.pushState({}, '', currentPath);
            router();
        }
        if (!document.getElementById('user-menu-container')?.contains(e.target)) {
            document.getElementById('user-menu-dropdown')?.setAttribute('style', 'display: none;');
        }
    });
    appDiv.addEventListener('submit', e => {
        if (e.target && e.target.id === 'new-project-form') {
            e.preventDefault();
            handleFormSubmit(e);
        }
    });

    // 2. Setup the Clerk listener to handle auth changes
    clerk.addListener(({ user }) => {
        renderAuthUI(user); // Update the Sign In/Out button
        currentPath = window.location.pathname; // Ensure path is current
        router(); // Re-render the main content based on new auth state
    });

    // 3. Initial load
    await clerk.load();
}

startApp();