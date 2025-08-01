import { initDB, addPost as dbAddPost, loadPosts as dbLoadPosts, deletePost as dbDeletePost, getPost as dbGetPost, updatePost as dbUpdatePost } from './db.js';

let appDb; // Renamed to avoid conflict with imported functions
let localStream;
let peerConnection; // Placeholder for RTCPeerConnection if we were to implement full WebRTC

const normalBoards = [
    { name: '/b/', topic: 'Random' },
    { name: '/g/', topic: 'Technology and Gadgets',
        subBoards: [
            { name: '/g/linux/', topic: 'Linux Desktops and Servers' },
            { name: '/g/hardware/', topic: 'Computer Hardware Discussions' },
            { name: '/g/programming/', topic: 'Programming and Development' }
        ]
    },
    { name: '/v/', topic: 'Video Games',
        subBoards: [
            { name: '/v/pc/', topic: 'PC Gaming' },
            { name: '/v/console/', topic: 'Console Gaming' },
            { name: '/v/retro/', topic: 'Retro Gaming' }
        ]
    },
    { name: '/pol/', topic: 'Politics' },
    { name: '/biz/', topic: 'Business and Finance' },
    { name: '/fit/', topic: 'Health and Fitness' },
    { name: '/k/', topic: 'Weapons' }
];

const videoCallBoards = [
    "General Chat",
    "Random Fun",
    "Tech Talk",
    "Art Zone"
];

let currentNormalBoardName = null;

// Renamed displayPost to createPostElement and modified to return the DOM element
function createPostElement(postData) {
    const { id, file, fileType, comment, timestamp, linkUrl, linkStatus, linkReason, username, parentId } = postData;

    const postDiv = document.createElement('div');
    postDiv.classList.add('post');
    if (parentId) {
        postDiv.classList.add('reply-post'); // Add class for styling replies
        postDiv.dataset.parentId = parentId;
    }
    postDiv.dataset.id = id;

    if (file && (fileType === 'video' || fileType === 'image')) {
        const mediaElement = fileType === 'video' ? document.createElement('video') : document.createElement('img');
        mediaElement.controls = fileType === 'video';
        mediaElement.src = URL.createObjectURL(file); // Create blob URL for display
        mediaElement.onerror = (e) => console.error("Error loading media:", e);
        postDiv.append(mediaElement);
    }

    if (linkUrl) {
        const linkDiv = document.createElement('div');
        linkDiv.classList.add('post-link');
        const linkAnchor = document.createElement('a');
        linkAnchor.href = linkUrl;
        linkAnchor.textContent = `Link: ${linkUrl}`;
        linkAnchor.target = '_blank'; // Open in new tab
        linkAnchor.rel = 'noopener noreferrer'; // Security best practice

        const statusIndicator = document.createElement('span');
        statusIndicator.classList.add('link-status-indicator');
        // Add specific class based on linkStatus for styling
        statusIndicator.classList.add(`link-status-${linkStatus || 'unknown'}`);
        statusIndicator.textContent = linkStatus ? linkStatus.toUpperCase() : 'UNKNOWN';

        if (linkReason) {
            statusIndicator.title = `Status: ${linkStatus ? linkStatus.toUpperCase() : 'UNKNOWN'}. Reason: ${linkReason}`; // Show reason on hover
        }

        linkDiv.append(linkAnchor, statusIndicator);
        postDiv.append(linkDiv);
    }

    const commentElement = document.createElement('p');
    const usernameSpan = document.createElement('span');
    usernameSpan.classList.add('post-username');
    usernameSpan.textContent = username || 'Anonymous'; // Display username or 'Anonymous'

    const commentTextNode = document.createTextNode(` :: ${comment || 'No comment.'}`); // Separator and comment text

    commentElement.append(usernameSpan, commentTextNode); // Append username span and then the rest of the comment

    const timestampElement = document.createElement('p');
    timestampElement.classList.add('timestamp');
    timestampElement.textContent = new Date(timestamp).toLocaleString();

    const deleteButton = document.createElement('button');
    deleteButton.classList.add('delete-button');
    deleteButton.textContent = 'X';
    deleteButton.title = 'Delete Post';
    deleteButton.onclick = () => handleDeletePost(id); // Changed function call to local handler

    // New: Reply button
    const replyButton = document.createElement('button');
    replyButton.classList.add('reply-button');
    replyButton.textContent = 'Reply';
    // Event listener for this button will be delegated from document

    // Append elements in desired order
    postDiv.append(commentElement, timestampElement, deleteButton, replyButton);

    // New: Containers for replies and reply form
    const repliesContainer = document.createElement('div');
    repliesContainer.classList.add('replies-container');
    postDiv.append(repliesContainer);

    const replyFormContainer = document.createElement('div');
    replyFormContainer.classList.add('reply-form-container', 'hidden'); // Initially hidden
    postDiv.append(replyFormContainer);

    return postDiv; // Return the created DOM element
}

// Function to recursively render posts and their children
function renderBoardPosts(allPosts) {
    const postsContainer = document.getElementById('posts-container');
    postsContainer.innerHTML = ''; // Clear existing posts

    // Create a map for quick access to posts by ID and add a children array
    const postsMap = new Map(allPosts.map(post => [post.id, { ...post, children: [] }]));

    // Build the thread hierarchy
    const topLevelPosts = [];
    for (const post of postsMap.values()) {
        if (post.parentId) {
            const parent = postsMap.get(post.parentId);
            if (parent) {
                parent.children.push(post);
            } else {
                // If parent not found (e.g., parent deleted), treat as top-level
                topLevelPosts.push(post);
            }
        } else {
            topLevelPosts.push(post);
        }
    }

    // Sort top-level posts by timestamp (newest first)
    topLevelPosts.sort((a, b) => b.timestamp - a.timestamp);

    // Recursive function to append a post and its children
    function appendPostAndChildren(post, parentElement) {
        const postDiv = createPostElement(post); // Create the DOM element for this post
        parentElement.append(postDiv);

        // Sort children chronologically
        post.children.sort((a, b) => a.timestamp - b.timestamp);

        const repliesContainer = postDiv.querySelector('.replies-container');
        if (repliesContainer) {
            for (const child of post.children) {
                appendPostAndChildren(child, repliesContainer); // Recurse for children
            }
        }
    }

    // Start appending from top-level posts
    for (const post of topLevelPosts) {
        appendPostAndChildren(post, postsContainer);
    }
}

// Handler for deleting a post
async function handleDeletePost(id) {
    const postToDelete = await dbDeletePost(appDb, id); // Call imported deletePost
    // Find the post div by its data-id attribute
    const postDiv = document.querySelector(`.post[data-id="${id}"]`); // Changed class selector
    if (postDiv) {
        // Find video or image element and revoke its object URL
        const mediaElement = postDiv.querySelector('video') || postDiv.querySelector('img');
        if (mediaElement && mediaElement.src.startsWith('blob:')) {
            URL.revokeObjectURL(mediaElement.src);
        }
        postDiv.remove(); // Remove the post div from the DOM
        // Note: Replies to this post will no longer be visible unless the board is reloaded,
        // or a more complex DOM traversal/re-parenting logic is added.
    }
}

async function checkLinkWithAI(url, postId, boardName) {
    try {
        // When deployed outside of Websim, AI capabilities require a backend server.
        // This 'fetch' call assumes there's a backend endpoint at '/api/check-link'
        // that proxies the request to an actual AI model (e.g., OpenAI, Gemini).
        // The backend should apply the system prompt and handle API key security.
        const response = await fetch('/api/check-link', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: url }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${await response.text()}`);
        }

        const result = await response.json();
        // Expected result format: { type: "safe" | "malware" | "porn", reason: string }
        let newStatus = result.type;
        let reason = result.reason;

        // Ensure the returned type is one of the expected values, default to 'error' if not
        const allowedTypes = ['safe', 'malware', 'porn'];
        if (!allowedTypes.includes(newStatus)) {
            newStatus = 'error';
            reason = 'Invalid AI response type or format.';
        }

        // Update the post in IndexedDB with the new status
        const post = await dbGetPost(appDb, postId); // Use imported getPost
        if (post) {
            post.linkStatus = newStatus;
            post.linkReason = reason; // Store reason for display
            await dbUpdatePost(appDb, post); // Use imported updatePost

            // If the post is currently displayed, update its DOM representation
            if (boardName === currentNormalBoardName) {
                // Remove the old post div and re-display with new status
                const oldPostDiv = document.querySelector(`.post[data-id="${postId}"]`);
                if (oldPostDiv) {
                    oldPostDiv.remove();
                    displayPost(post); // Re-display with updated data
                }
            }
        }
    } catch (error) {
        console.error('AI link check failed:', error);
        // Update status to 'error' if AI check fails
        const post = await dbGetPost(appDb, postId); // Use imported getPost
        if (post) {
            post.linkStatus = 'error';
            post.linkReason = 'AI check failed or backend unavailable.';
            await dbUpdatePost(appDb, post); // Use imported updatePost
            if (boardName === currentNormalBoardName) {
                const oldPostDiv = document.querySelector(`.post[data-id="${postId}"]`);
                if (oldPostDiv) {
                    oldPostDiv.remove();
                    displayPost(post);
                }
            }
        }
    }
}

// --- Normal Board Logic ---

// Helper function to create a board div (main or sub)
function createBoardDiv(board, isSub = false) {
    const boardDiv = document.createElement('div');
    boardDiv.classList.add(isSub ? 'sub-board' : 'normal-board');
    boardDiv.dataset.boardName = board.name; // Store full board name for selection

    const boardInfo = document.createElement('div');
    boardInfo.classList.add('board-info');

    const boardTitle = document.createElement('span');
    boardTitle.classList.add('board-title');
    boardTitle.textContent = board.name;

    const boardTopic = document.createElement('span');
    boardTopic.classList.add('board-topic');
    boardTopic.textContent = `- ${board.topic}`;

    boardInfo.append(boardTitle, boardTopic);
    boardDiv.append(boardInfo);

    // Add click listener to select the board
    boardDiv.onclick = () => selectNormalBoard(board.name);

    return boardDiv;
}

function renderNormalBoards() {
    const container = document.getElementById('normal-boards-container');
    container.innerHTML = ''; // Clear existing boards

    normalBoards.forEach(board => {
        // Render the main board entry
        const mainBoardDiv = createBoardDiv(board, false);
        container.append(mainBoardDiv);

        // If there are sub-boards, create a container for them
        if (board.subBoards && board.subBoards.length > 0) {
            const subBoardsContainer = document.createElement('div');
            subBoardsContainer.classList.add('sub-boards-list');
            
            board.subBoards.forEach(subBoard => {
                const subBoardDiv = createBoardDiv(subBoard, true);
                subBoardsContainer.append(subBoardDiv);
            });
            container.append(subBoardsContainer);
        }
    });
}

async function selectNormalBoard(boardName) {
    currentNormalBoardName = boardName;

    // Find the selected board (could be a main board or a sub-board)
    let selectedBoard = null;
    for (const board of normalBoards) {
        if (board.name === boardName) {
            selectedBoard = board;
            break;
        }
        if (board.subBoards && board.subBoards.length > 0) {
            selectedBoard = board.subBoards.find(sub => sub.name === boardName);
            if (selectedBoard) {
                break;
            }
        }
    }

    if (selectedBoard) {
        document.getElementById('current-normal-board-title').textContent = `${selectedBoard.name} - ${selectedBoard.topic}`;
    } else {
        document.getElementById('current-normal-board-title').textContent = boardName; // Fallback if not found
    }

    document.getElementById('normal-boards-section').classList.add('hidden');
    document.getElementById('video-call-boards-section').classList.add('hidden');
    document.getElementById('selected-normal-board-view').classList.remove('hidden');

    // Load posts using the imported function
    const posts = await dbLoadPosts(appDb, currentNormalBoardName); 
    renderBoardPosts(posts); // Use the new function to render posts and threads
}

function backToBoardList() {
    currentNormalBoardName = null;
    document.getElementById('posts-container').innerHTML = ''; // Changed ID
    document.getElementById('media-file-input').value = ''; // Changed ID
    document.getElementById('link-input').value = ''; // New input to clear
    document.getElementById('post-comment-input').value = ''; // Changed ID
    document.getElementById('username-input').value = ''; // Clear username input

    document.getElementById('selected-normal-board-view').classList.add('hidden');
    document.getElementById('normal-boards-section').classList.remove('hidden');
    document.getElementById('video-call-boards-section').classList.remove('hidden');
}

// --- Video Call Board Logic ---

function renderCallBoards() {
    const container = document.getElementById('call-boards-container');
    container.innerHTML = ''; // Clear existing boards

    videoCallBoards.forEach(boardName => {
        const boardDiv = document.createElement('div');
        boardDiv.classList.add('call-board');

        const boardTitle = document.createElement('span');
        boardTitle.classList.add('board-title');
        boardTitle.textContent = `|| ${boardName} ||`;

        const joinButton = document.createElement('button');
        joinButton.classList.add('join-call-button');
        joinButton.textContent = 'Join Call';
        joinButton.onclick = () => joinCall(boardName);

        boardDiv.append(boardTitle, joinButton);
        container.append(boardDiv);
    });
}

async function joinCall(boardName) {
    const mainContent = document.getElementById('main-content');
    const callOverlay = document.getElementById('call-interface-overlay');
    const localVideoElement = document.getElementById('local-video');
    const currentCallBoardName = document.getElementById('current-call-board-name');

    currentCallBoardName.textContent = `|| ${boardName} ||`;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideoElement.srcObject = localStream;

        // Display the call interface
        mainContent.classList.add('hidden');
        callOverlay.classList.remove('hidden');

        // Optional: Initialize RTCPeerConnection if full WebRTC was to be implemented
        // peerConnection = new RTCPeerConnection({
        //     iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        // });
        // localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        // peerConnection.ontrack = (event) => {
        //     document.getElementById('remote-video').srcObject = event.streams[0];
        // };
        // peerConnection.onicecandidate = (event) => { /* send candidate to remote peer via signaling */ };
        // peerConnection.onnegotiationneeded = async () => { /* create offer and send to remote peer via signaling */ };

    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Could not start video call. Please ensure you have a camera and microphone and grant permissions.');
        leaveCall(); // In case some elements were shown
    }
}

function leaveCall() {
    const mainContent = document.getElementById('main-content');
    const callOverlay = document.getElementById('call-interface-overlay');
    const localVideoElement = document.getElementById('local-video');
    const remoteVideoElement = document.getElementById('remote-video');

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    localVideoElement.srcObject = null;
    remoteVideoElement.srcObject = null;

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    callOverlay.classList.add('hidden');
    mainContent.classList.remove('hidden');
}

// Function to create and set up a reply form within a specific container
function createAndSetupReplyForm(parentPostId, replyFormContainer) {
    // Clear previous content in case it was setup before
    replyFormContainer.innerHTML = '';

    const form = document.createElement('form');
    form.classList.add('reply-post-form');
    form.dataset.parentId = parentPostId; // Store parent ID on the form

    form.innerHTML = `
        <input type="text" class="reply-username-input" placeholder="Your username (optional)">
        <input type="file" class="reply-media-file-input" accept="video/*,image/*">
        <input type="url" class="reply-link-input" placeholder="Add a link (e.g., https://example.com)" pattern="https?://.*" title="Please enter a valid URL starting with http:// or https://">
        <textarea class="reply-post-comment-input" placeholder="Add a comment..." rows="2"></textarea>
        <button type="submit">Post Reply</button>
    `;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        const fileInput = form.querySelector('.reply-media-file-input');
        const linkInput = form.querySelector('.reply-link-input');
        const commentInput = form.querySelector('.reply-post-comment-input');
        const usernameInput = form.querySelector('.reply-username-input');

        const file = fileInput.files[0];
        const link = linkInput.value.trim();
        const comment = commentInput.value.trim();
        const username = usernameInput.value.trim();
        const parentId = parseInt(form.dataset.parentId); // Get parentId from form's dataset

        if (!file && !link && !comment) {
            alert('Please add a file, a link, or a comment to create a reply.');
            return;
        }

        if (currentNormalBoardName) {
            // Call the imported addPost function, passing the parentId
            const newPostData = await dbAddPost(appDb, file, comment, link, currentNormalBoardName, username, parentId);
            
            // Append the new reply to the correct replies-container of the parent post
            const parentPostDiv = document.querySelector(`.post[data-id="${parentId}"]`);
            if (parentPostDiv) {
                const repliesContainer = parentPostDiv.querySelector('.replies-container');
                if (repliesContainer) {
                    const newReplyDiv = createPostElement(newPostData); // Use the refactored createPostElement
                    // createPostElement already adds 'reply-post' class if parentId exists.
                    repliesContainer.append(newReplyDiv);
                }
            }

            // Clear the form inputs and hide it
            fileInput.value = '';
            linkInput.value = '';
            commentInput.value = '';
            // Keep username input value for subsequent replies unless explicitly cleared by user
            replyFormContainer.classList.add('hidden');

            if (newPostData.linkUrl) {
                checkLinkWithAI(newPostData.linkUrl, newPostData.id, newPostData.boardName);
            }
        } else {
            alert('Board context lost for reply. Please re-select board.');
        }
    });

    replyFormContainer.append(form);
}

// Function to detect device type and add a class to the body
function detectDeviceAndSetClass() {
    const userAgent = navigator.userAgent;
    let isMobileDevice = false;

    // Check for common mobile/tablet patterns in user agent
    const mobileRegex = /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|rim)|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i;

    if (mobileRegex.test(userAgent)) {
        isMobileDevice = true;
    }

    // ChromeOS should be treated as PC
    if (userAgent.includes('CrOS')) {
        isMobileDevice = false;
    }

    // Apply class to body
    if (isMobileDevice) {
        document.body.classList.add('is-mobile');
        console.log("Detected as mobile device.");
    } else {
        document.body.classList.add('is-desktop');
        console.log("Detected as desktop device (including ChromeOS).");
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    detectDeviceAndSetClass(); // New: Device detection and class assignment

    appDb = await initDB(); // Initialize appDb using the imported initDB
    renderNormalBoards(); // Render the normal boards
    renderCallBoards(); // Render the video call boards

    const form = document.getElementById('post-upload-form'); // Changed ID
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const fileInput = document.getElementById('media-file-input'); // Changed ID
        const linkInput = document.getElementById('link-input'); // New input
        const commentInput = document.getElementById('post-comment-input'); // Changed ID
        const usernameInput = document.getElementById('username-input'); // Get username input

        const file = fileInput.files[0];
        const link = linkInput.value.trim();
        const comment = commentInput.value.trim();
        const username = usernameInput.value.trim(); // Get username value

        // Require at least one of file, link, or comment to create a post
        if (!file && !link && !comment) {
            alert('Please add a file, a link, or a comment to create a post.');
            return;
        }

        if (currentNormalBoardName) {
            // New top-level post, so parentId is null (default in dbAddPost)
            const newPostData = await dbAddPost(appDb, file, comment, link, currentNormalBoardName, username); 
            
            // To ensure new top-level posts appear at the top, we re-render the board.
            // This is simpler than trying to insert into the sorted top-level list
            // while maintaining children. For large boards, optimize later.
            const posts = await dbLoadPosts(appDb, currentNormalBoardName);
            renderBoardPosts(posts); // Use the new function to render posts and threads

            fileInput.value = ''; // Clear file input
            linkInput.value = ''; // Clear link input
            commentInput.value = ''; // Clear comment input
            // Keep username input value for subsequent posts unless explicitly cleared by user
            
            if (newPostData.linkUrl) {
                checkLinkWithAI(newPostData.linkUrl, newPostData.id, newPostData.boardName);
            }
        } else {
            alert('Please select a board before posting.');
        }
    });

    document.getElementById('leave-call-button').addEventListener('click', leaveCall);
    document.getElementById('back-to-board-list-button').addEventListener('click', backToBoardList);

    // New: Delegated event listener for reply buttons
    document.addEventListener('click', (event) => {
        if (event.target.classList.contains('reply-button')) {
            const replyButton = event.target;
            const parentPostDiv = replyButton.closest('.post');
            const parentPostId = parseInt(parentPostDiv.dataset.id);
            const replyFormContainer = parentPostDiv.querySelector('.reply-form-container');

            // Toggle visibility
            replyFormContainer.classList.toggle('hidden');

            // If it's now visible, set up the form
            if (!replyFormContainer.classList.contains('hidden')) {
                createAndSetupReplyForm(parentPostId, replyFormContainer);
            }
        }
    });
});

// Add keydown listener to download db.js on Ctrl+C
document.addEventListener('keydown', async (event) => {
    // Check for Ctrl+C (Windows/Linux) or Cmd+C (macOS)
    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
        event.preventDefault(); // Prevent default copy behavior

        try {
            // Fetch the content of db.js
            const response = await fetch('db.js');
            if (!response.ok) {
                throw new Error(`Failed to fetch db.js: ${response.statusText}`);
            }
            const dbContent = await response.text();

            // Create a Blob from the content
            const blob = new Blob([dbContent], { type: 'application/javascript' });

            // Create a temporary anchor element
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'db.js'; // Set the desired file name

            // Programmatically click the link to trigger download
            document.body.appendChild(a); // Append to body is good practice
            a.click();
            document.body.removeChild(a); // Clean up the element

            // Revoke the object URL to free up memory
            URL.revokeObjectURL(url);
            console.log('db.js downloaded successfully.');

        } catch (error) {
            console.error('Error downloading db.js:', error);
            alert('Failed to download db.js.');
        }
    }
});