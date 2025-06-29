import './style.css';
import { Clerk } from '@clerk/clerk-js';

// --- CONFIGURATION ---
const API_URL = import.meta.env.VITE_API_URL;
const API_SECRET_KEY = import.meta.env.VITE_API_SECRET_KEY;
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// --- DOM ELEMENTS ---
const appDiv = document.querySelector('#app');
const authDiv = document.querySelector('#auth-section');

// --- CLERK INITIALIZATION ---
const clerk = new Clerk(CLERK_PUBLISHABLE_KEY);

async function startApp() {
    await clerk.load();

    // This listener is the heart of the reactive UI
    clerk.addListener(({ user }) => {
        if (user) {
            // User is signed in
            renderSignedInUI(user);
            loadProjectData();
        } else {
            // User is signed out
            renderSignedOutUI();
        }
    });
}

// --- UI RENDERING FUNCTIONS ---
function renderSignedInUI(user) {
    const userButton = document.createElement('button');
    userButton.textContent = `Welcome, ${user.firstName || user.primaryEmailAddress.emailAddress}`;
    userButton.addEventListener('click', () => clerk.openUserProfile());

    const signOutButton = document.createElement('button');
    signOutButton.textContent = 'Sign Out';
    signOutButton.addEventListener('click', () => clerk.signOut());

    authDiv.innerHTML = ''; // Clear previous buttons
    authDiv.appendChild(userButton);
    authDiv.appendChild(signOutButton);
}

function renderSignedOutUI() {
    const signInButton = document.createElement('button');
    signInButton.textContent = 'Sign In';
    signInButton.addEventListener('click', () => clerk.openSignIn());

    authDiv.innerHTML = ''; // Clear previous buttons
    authDiv.appendChild(signInButton);
    appDiv.innerHTML = '<h2>Please sign in to view project details.</h2>';
}


// --- DATA FETCHING LOGIC (our existing function) ---
async function loadProjectData() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');

    appDiv.innerHTML = `<div id="project-content"></div>`;
    const projectContentDiv = document.querySelector('#project-content');

    if (!projectId) {
        projectContentDiv.innerHTML = `<h2>Welcome!</h2><p>Please select a project by adding '?project=PROJ-XXXX' to the URL.</p>`;
        return;
    }

    projectContentDiv.innerHTML = `<p><i>Loading data for project ${projectId}...</i></p>`;

    try {
        const response = await fetch(`${API_URL}/project/${projectId}`, {
            headers: { 'Authorization': `Bearer ${API_SECRET_KEY}` }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `API responded with status ${response.status}` }));
            throw new Error(errorData.error || `An unknown API error occurred.`);
        }

        const project = await response.json();

        let assetsHtml = 'No assets defined in masterplan.';
        if (project.masterplan && project.masterplan.requiredAssets && project.masterplan.requiredAssets.length > 0) {
            assetsHtml = '<ul>';
            project.masterplan.requiredAssets.forEach(asset => {
                assetsHtml += `<li><strong>${asset.description || ''}</strong>: [${asset.status || 'Pending'}]</li>`;
            });
            assetsHtml += '</ul>';
        }

        const managerTag = project.assignedManager ? project.assignedManager.tag : 'Not Assigned';
        projectContentDiv.innerHTML = `<h2>${project.name || 'Project Name Missing'} (${project.id})</h2><p><strong>Status:</strong> ${project.status || 'N/A'}</p><p><strong>Project Lead:</strong> ${managerTag}</p><hr><h3>Assets</h3><div>${assetsHtml}</div>`;

    } catch (error) {
        console.error('Failed to load project:', error);
        projectContentDiv.innerHTML = `<h2 style="color: red;">Failed to Load Project</h2><p>${error.message}</p>`;
    }
}

// Run the application
startApp();