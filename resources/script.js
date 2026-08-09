let rawMoviesData = [];
    let appSettings = { user1_name: '', user2_name: '', volume_path: '' };
    let isEditing = false;
    let sortField = 'title';
    let sortAscending = true;
    let hideWatched = false;
    let selectedGenre = '';
    let searchQuery = '';

    function showSaveButton(input, id, field, isMappedName = false) {
        if (input.nextElementSibling && input.nextElementSibling.classList.contains('inline-save-btn')) {
            const btn = input.nextElementSibling;
            btn.style.display = 'inline-block';
            clearTimeout(btn.hideTimeout);
            return;
        }

        const btn = document.createElement('button');
        btn.innerText = '💾';
        btn.className = 'inline-save-btn';
        btn.style.marginLeft = '4px';
        btn.style.cursor = 'pointer';
        btn.style.background = 'transparent';
        btn.style.border = 'none';
        btn.style.fontSize = '1.2rem';
        btn.style.verticalAlign = 'middle';
        btn.title = 'Save Changes';
        
        btn.onmousedown = (e) => {
            // Prevent blur event from firing before click is processed
            e.preventDefault();
        };

        btn.onclick = () => {
            isEditing = false;
            if (isMappedName) {
                handleMappedNameChange(id, input.value);
            } else {
                handleFieldChange(id, field, input.value || (field === 'season' || field === 'episode' || field === 'rm_rating' ? '' : 'N/A'));
            }
            btn.style.display = 'none';
            input.style.border = '1px solid transparent';
        };

        input.parentNode.insertBefore(btn, input.nextSibling);
    }

    function handleInputFocus(input, id, field, isMappedName = false) {
        isEditing = true;
        input.style.border = '1px solid var(--border-color)';
        showSaveButton(input, id, field, isMappedName);
    }

    function handleInputBlur(input) {
        const btn = input.nextElementSibling;
        if (btn && btn.classList.contains('inline-save-btn')) {
            btn.hideTimeout = setTimeout(() => {
                btn.style.display = 'none';
                input.style.border = '1px solid transparent';
                isEditing = false;
            }, 10000);
        } else {
            isEditing = false;
        }
    }

    function toggleTheme() {
        const body = document.body;
        body.classList.toggle('light-mode');
        const isLight = body.classList.contains('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        document.getElementById('theme-toggle').innerText = isLight ? '☀️' : '🌙';
    }

    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
        document.getElementById('theme-toggle').innerText = '☀️';
    }

    async function fetchSettings() {
        try {
            const res = await fetch('/api/settings');
            appSettings = await res.json();
            
            // Update UI with settings
            const u1 = appSettings.user1_name || '';
            const u2 = appSettings.user2_name || '';
            
            document.getElementById('setting-omdb').value = appSettings.omdb_api_key || '';
            
            if (u1 && u2) {
                document.getElementById('app-title-names').innerText = `${u1[0]} & ${u2[0]}`;
                document.getElementById('header-rm').innerText = `${u1[0]}&${u2[0]}`;
            } else if (u1) {
                document.getElementById('app-title-names').innerText = u1;
                document.getElementById('header-rm').innerText = u1;
            } else if (u2) {
                document.getElementById('app-title-names').innerText = u2;
                document.getElementById('header-rm').innerText = u2;
            } else {
                document.getElementById('app-title-names').innerText = '';
                document.getElementById('header-rm').innerText = 'Joint';
            }
            
            document.getElementById('app-tracking-path').innerText = `Tracking ${appSettings.volume_path || 'No Path Set'}`;
            document.getElementById('header-user1').innerText = u1;
            document.getElementById('header-user2').innerText = u2;
            
            document.getElementById('th-user1').style.display = u1 ? 'table-cell' : 'none';
            document.getElementById('th-user2').style.display = u2 ? 'table-cell' : 'none';
            
            document.getElementById('setting-path').value = appSettings.volume_path || '';
            document.getElementById('setting-user1').value = u1;
            document.getElementById('setting-user2').value = u2;
        } catch(e) {
            console.error("Error fetching settings:", e);
        }
    }

    async function saveSettings() {
        const updates = {
            volume_path: document.getElementById('setting-path').value,
            user1_name: document.getElementById('setting-user1').value,
            user2_name: document.getElementById('setting-user2').value,
            omdb_api_key: document.getElementById('setting-omdb').value
        };
        try {
            await fetch('/api/settings/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            showSyncStatus();
            await fetchSettings();
            rawMoviesData = []; // clear to force re-render with new settings
            fetchMovies();
            hideSettings();
        } catch(e) {
            console.error("Error saving settings", e);
        }
    }

    function showSettings() {
        document.getElementById('overview-view').style.display = 'none';
        document.getElementById('details-view').style.display = 'none';
        document.getElementById('settings-view').style.display = 'block';
    }

    function hideSettings() {
        document.getElementById('settings-view').style.display = 'none';
        document.getElementById('overview-view').style.display = 'block';
    }

    async function autoFetchAll() {
        if (!appSettings.omdb_api_key) {
            alert("Please add an OMDb API key in Settings first to auto-fetch ratings!");
            showSettings();
            return;
        }
        
        const lastFetchTime = parseInt(localStorage.getItem('lastFetchTime') || '0', 10);
        const now = Date.now();
        if (now - lastFetchTime < 120000) { // 2 minutes
            const remaining = Math.ceil((120000 - (now - lastFetchTime)) / 1000);
            alert(`To protect your OMDb API limit, please wait ${remaining} seconds before running a bulk fetch again.`);
            return;
        }
        localStorage.setItem('lastFetchTime', now.toString());
        
        const btn = document.querySelector('button[title="Auto-Fetch Missing Ratings"]');
        if (btn) btn.innerText = '⏳';
        
        for (const item of rawMoviesData) {
            if (item.imdb === 'N/A' || item.rt_critics === 'N/A' || item.poster === '') {
                try {
                    const displayTitle = item.mapped_name || item.title;
                    const res = await fetch('/api/movies/fetch_ratings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: item.id, title: displayTitle, imdb_id: item.imdb_id })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.updates) {
                            const index = rawMoviesData.findIndex(m => m.id === item.id);
                            if (index !== -1) {
                                rawMoviesData[index] = { ...rawMoviesData[index], ...data.updates };
                            }
                        }
                    }
                } catch(e) {
                    console.error("Error fetching for", item.title, e);
                }
                // Sleep slightly to not hammer the API
                await new Promise(r => setTimeout(r, 200));
            }
        }
        
        if (btn) btn.innerText = '🪄';
        renderMovies();
    }

    async function fetchMovies() {
        if (isEditing) return; // Don't refresh while user is typing
        
        try {
            const response = await fetch('/api/movies');
            const newMovies = await response.json();
            
            if (JSON.stringify(newMovies) !== JSON.stringify(rawMoviesData)) {
                rawMoviesData = newMovies;
                updateGenreDropdown();
                renderMovies();
            }
        } catch (error) {
            console.error("Error fetching movies:", error);
        }
    }

    function handleSearch(event) {
        searchQuery = event.target.value.toLowerCase();
        renderMovies();
    }

    async function updateData(id, updates) {
        try {
            showSyncStatus();
            await fetch('/api/movies/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...updates })
            });
            const index = rawMoviesData.findIndex(m => m.id === id);
            if (index !== -1) {
                rawMoviesData[index] = { ...rawMoviesData[index], ...updates };
                updateStats();
                if (sortField === Object.keys(updates)[0]) {
                    renderMovies();
                }
            }
        } catch (error) {
            console.error("Error updating data:", error);
        }
    }

    function showSyncStatus() {
        const el = document.getElementById('sync-status');
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 2000);
    }

    function handleWatchToggle(id, field, isWatched, trElement) {
        // optimistically update local data
        const index = rawMoviesData.findIndex(m => m.id === id);
        if (index !== -1) {
            rawMoviesData[index][field] = isWatched;
            if (trElement) {
                if (field === 'watched') {
                    if (isWatched) trElement.classList.add('watched');
                    else trElement.classList.remove('watched');
                } else {
                    const u1_watched = rawMoviesData[index].watched_remko;
                    const u2_watched = rawMoviesData[index].watched_mikaela;
                    
                    if (u1_watched && u2_watched) {
                        trElement.classList.add('watched');
                        rawMoviesData[index].watched = true;
                    } else if (!u1_watched && !u2_watched) {
                        trElement.classList.remove('watched');
                        rawMoviesData[index].watched = false;
                    } else {
                        trElement.classList.remove('watched');
                        rawMoviesData[index].watched = false;
                    }
                    renderMovies(); // re-render to update checkboxes properly
                }
            }
        }
        updateData(id, { [field]: isWatched });
    }

    async function unlinkOmdb(id) {
        if(confirm("Are you sure you want to unlink this OMDb item? This will remove all OMDb ratings and data.")) {
            await updateData(id, { 'imdb_id': '', 'imdb': '', 'rt_critics': '', 'poster': '', 'plot': '', 'genre': '' });
            showDetails(id);
            renderMovies();
        }
    }

    async function searchOmdb(id, fallbackTitle) {
        if (!appSettings.omdb_api_key) {
            alert("Please set an OMDb API Key in Settings first.");
            return;
        }
        let searchTitle = fallbackTitle;
        const mappedInput = document.getElementById('mapped-name-input');
        if (mappedInput && mappedInput.value.trim() !== '') {
            searchTitle = mappedInput.value.trim();
        }

        const resultsDiv = document.getElementById('omdb-results');
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = 'Searching...';
        
        try {
            const res = await fetch('/api/movies/search_omdb', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: searchTitle })
            });
            const data = await res.json();
            if (res.ok && data.results) {
                resultsDiv.innerHTML = data.results.map(r => 
                    `<div style="padding: 5px; border-bottom: 1px solid var(--border-color); cursor: pointer; display: flex; justify-content: space-between;" 
                          onmouseover="this.style.background='var(--primary-color)'; this.style.color='white'" 
                          onmouseout="this.style.background='transparent'; this.style.color='var(--text-color)'"
                          onclick="linkOmdb('${id}', '${r.imdbID}')">
                        <span><strong>${r.Title}</strong> (${r.Year})</span>
                        <span style="font-size: 0.8rem;">${r.Type}</span>
                    </div>`
                ).join('');
            } else {
                resultsDiv.innerHTML = data.error || 'No results found.';
            }
        } catch (e) {
            resultsDiv.innerHTML = 'Error searching.';
        }
    }
    
    async function linkOmdb(id, imdbId) {
        document.getElementById('omdb-results').innerHTML = 'Linking...';
        await updateData(id, { 'imdb_id': imdbId });
        
        const item = rawMoviesData.find(m => m.id === id);
        if (item) {
            const displayTitle = item.mapped_name || item.title;
            const res = await fetch('/api/movies/fetch_ratings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: item.id, title: displayTitle, imdb_id: imdbId })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.updates) {
                    const index = rawMoviesData.findIndex(m => m.id === item.id);
                    if (index !== -1) {
                        rawMoviesData[index] = { ...rawMoviesData[index], ...data.updates };
                        updateGenreDropdown();
                    }
                }
            }
        }
        showDetails(id);
        renderMovies();
    }
    
    function handleFieldChange(id, field, value) {
        isEditing = false;
        updateData(id, { [field]: value });
    }

    function setSort(field) {
        if (sortField === field) {
            sortAscending = !sortAscending;
        } else {
            sortField = field;
            sortAscending = field === 'title' ? true : false;
        }
        renderMovies();
    }

    function updateSortIcons() {
        document.querySelectorAll('.sort-icon').forEach(el => {
            el.innerHTML = '';
            el.classList.remove('active');
        });
        const icon = document.getElementById(`sort-icon-${sortField}`);
        if (icon) {
            icon.innerHTML = sortAscending ? '▲' : '▼';
            icon.classList.add('active');
        }
    }

    function showDetails(id) {
        const item = rawMoviesData.find(m => m.id === id);
        if (!item) return;
        
        document.getElementById('overview-view').style.display = 'none';
        
        const displayTitle = item.mapped_name || item.title;
        const hasPoster = item.poster && item.poster !== 'N/A';
        const posterHtmlLarge = hasPoster 
            ? `<img src="${item.poster}" alt="Poster" onerror="handlePosterError(this, 'large')" style="width: 250px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); flex-shrink: 0;">` 
            : `<div style="width: 250px; height: 375px; background: var(--surface-light); border: 1px solid var(--border-color); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); flex-shrink: 0; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">No Poster</div>`;
        
        let detailsHtml = `
            <button class="btn-back" onclick="hideDetails()">← Back to Overview</button>
            <div style="display: flex; gap: 2rem; align-items: flex-start; margin-top: 1.5rem;">
                ${posterHtmlLarge}
                <div style="flex: 1; min-width: 0;">
                    <h2 style="font-size: 2.5rem; margin-bottom: 0.5rem; margin-top: 0;">${displayTitle}</h2>
                    
                    ${item.genre && item.genre !== 'N/A' ? `<div style="color: var(--accent-blue); font-weight: 500; font-size: 0.95rem; margin-bottom: 1rem; letter-spacing: 0.5px;">${item.genre}</div>` : ''}
                    
                    ${item.plot && item.plot !== 'N/A' ? `<div style="color: var(--text-color); line-height: 1.6; font-size: 1rem; margin-bottom: 2rem; background: var(--hover-bg); padding: 1.2rem; border-radius: 8px; border-left: 4px solid var(--accent-blue); box-shadow: 0 2px 8px rgba(0,0,0,0.1);">${item.plot}</div>` : ''}
                    
                    <div style="margin-bottom: 2rem;">
                        <label style="color: var(--text-muted); font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Mapped Name (override):</label>
                        <input type="text" id="mapped-name-input" value="${item.mapped_name || ''}" class="search-input" style="width: 300px; padding: 6px; font-size: 0.9rem;"
                            placeholder="Enter clean name..."
                            onfocus="handleInputFocus(this, '${item.id.replace(/'/g, "\\'")}', 'mapped_name', true)"
                            onblur="handleInputBlur(this)"
                            onkeydown="if(event.key==='Enter') { this.nextElementSibling?.click(); this.blur(); }">
                        <span id="save-status-${item.id.replace(/[^a-zA-Z0-9]/g, '')}" style="color: var(--accent-success); margin-left: 10px; opacity: 0; transition: opacity 0.3s;">✓ Saved</span>
                    </div>
            
            ${item.type === 'movie' ? `
            <div style="margin-bottom: 2rem;">
                <div style="margin-bottom: 0.75rem;">
                    <label style="color: var(--text-muted); font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Original Filename:</label>
                    <div style="font-family: monospace; font-size: 0.9rem; background: var(--hover-bg); padding: 8px; border-radius: 4px; border: 1px solid var(--border-color); overflow-x: auto;">${item.filename || 'Unknown'}</div>
                </div>
                <div>
                    <label style="color: var(--text-muted); font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">File Path:</label>
                    <div style="font-family: monospace; font-size: 0.9rem; background: var(--hover-bg); padding: 8px; border-radius: 4px; border: 1px solid var(--border-color); overflow-x: auto; white-space: nowrap;">${item.filepath || 'Unknown'}</div>
                </div>
            </div>
            ` : ''}
            
            <div style="margin-bottom: 2rem;">
                <label style="color: var(--text-muted); font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">OMDb Link:</label>
                <div id="omdb-link-container">
                    ${item.imdb_id ? 
                        `<span style="color: var(--accent-success);">✓ Linked (${item.imdb_id})</span> 
                         <button onclick="unlinkOmdb('${item.id.replace(/'/g, "\\'")}')" style="margin-left: 10px; background:transparent; border:none; cursor:pointer; font-size:0.8rem; text-decoration:underline; color:var(--text-muted);">Unlink</button>` :
                        `<button onclick="searchOmdb('${item.id.replace(/'/g, "\\'")}', '${displayTitle.replace(/'/g, "\\'")}')" style="padding: 4px 8px; font-size: 0.8rem; background: var(--surface-light); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-color); cursor: pointer;">🔍 Search Matches</button>`
                    }
                </div>
                <div id="omdb-results" style="margin-top: 10px; display: none; background: var(--surface-light); border: 1px solid var(--border-color); border-radius: 4px; padding: 10px; max-height: 200px; overflow-y: auto;"></div>
            </div>
            
            <div style="display: flex; gap: 1rem; margin-bottom: 2rem;">
                <div class="rating-badge rating-imdb">
                    <span class="icon">★</span> 
                    <input type="text" class="rating-input" style="width: 40px; background: transparent; border: 1px solid transparent; color: inherit; font-size: inherit; text-align: center;" value="${item.imdb !== 'N/A' ? item.imdb : ''}" 
                        onfocus="handleInputFocus(this, '${item.id.replace(/'/g, "\\'")}', 'imdb')" 
                        onblur="handleInputBlur(this)"
                        onkeydown="if(event.key==='Enter') { this.nextElementSibling?.click(); this.blur(); }" placeholder="N/A">
                </div>
                <div class="rating-badge rating-rt-critics">
                    <span class="icon">${(item.rt_critics === 'N/A' || item.rt_critics === '') ? '<span style="filter: grayscale(1); opacity: 0.5;">🍅</span>' : (parseInt(item.rt_critics) >= 60 ? '🍅' : '🤢')}</span>
                    <input type="text" class="rating-input" style="width: 40px; background: transparent; border: 1px solid transparent; color: inherit; font-size: inherit; text-align: center;" value="${item.rt_critics !== 'N/A' ? item.rt_critics : ''}" 
                        onfocus="handleInputFocus(this, '${item.id.replace(/'/g, "\\'")}', 'rt_critics')" 
                        onblur="handleInputBlur(this)"
                        onkeydown="if(event.key==='Enter') this.blur();">
                </div>
                <div class="rating-badge">
                    <span style="opacity: 0.7; margin-right: 5px;">${appSettings.user1_name[0] || 'U1'}&${appSettings.user2_name[0] || 'U2'}:</span> 
                    <input type="text" class="rating-input" style="width: 40px; background: transparent; border: 1px solid transparent; color: inherit; font-size: inherit; text-align: center;" value="${item.rm_rating || ''}" 
                        onfocus="handleInputFocus(this, '${item.id.replace(/'/g, "\\'")}', 'rm_rating')" 
                        onblur="handleInputBlur(this)"
                        onkeydown="if(event.key==='Enter') { this.nextElementSibling?.click(); this.blur(); }" placeholder="-">
                </div>
            </div>
        `;
        
        if (item.type === 'series' && item.episodes) {
            const sortedEps = item.episodes.sort((a, b) => {
                if (a.season !== b.season) return (a.season || 0) - (b.season || 0);
                return (a.episode || 0) - (b.episode || 0);
            });
            
            detailsHtml += `<h3>Episodes</h3><ul style="list-style:none; padding:0;">`;
            sortedEps.forEach(ep => {
                const s = ep.season || 0;
                const e = ep.episode || 0;
                detailsHtml += `
                    <li style="padding: 1rem; border-bottom: 1px solid var(--border-color); display: flex; flex-direction: column;">
                        <strong style="color: var(--accent-blue); margin-bottom: 4px;">S${s.toString().padStart(2,'0')}E${e.toString().padStart(2,'0')}</strong>
                        <span style="color: var(--text-muted); font-size: 0.9rem;">${ep.filename}</span>
                    </li>`;
            });
            detailsHtml += `</ul>`;
        }
        
        if (item.type === 'movie' && item.filepath) {
            const videoUrl = `/api/video?path=${encodeURIComponent(item.filepath)}`;
            const trackHtml = item.subtitle_path ? `<track src="/api/subtitle?path=${encodeURIComponent(item.subtitle_path)}" kind="subtitles" srclang="en" label="English" default>` : '';
            detailsHtml += `
            <div style="margin-top: 3rem; border-top: 1px solid var(--border-color); padding-top: 2rem;">
                <h3 style="margin-bottom: 1rem; color: var(--text-color);">Video Preview</h3>
                <video controls width="100%" style="background: black; border-radius: 8px; max-height: 50vh;" preload="metadata">
                    <source src="${videoUrl}" type="video/mp4">
                    ${trackHtml}
                    Your browser does not support the video tag.
                </video>
            </div>
            `;
        }
        
        detailsHtml += `</div></div>`; // Close the flex container and flex: 1 wrapper
        
        document.getElementById('details-view').innerHTML = detailsHtml;
        document.getElementById('details-view').style.display = 'block';
    }
    
    function hideDetails() {
        document.getElementById('details-view').style.display = 'none';
        document.getElementById('overview-view').style.display = 'block';
    }

    function handleMappedNameChange(id, value) {
        const index = rawMoviesData.findIndex(m => m.id === id);
        if (index !== -1) {
            rawMoviesData[index].mapped_name = value;
        }
        updateData(id, { mapped_name: value });
        
        const safeId = id.replace(/[^a-zA-Z0-9]/g, '');
        const statusEl = document.getElementById(`save-status-${safeId}`);
        if (statusEl) {
            statusEl.style.opacity = '1';
            setTimeout(() => { if(statusEl) statusEl.style.opacity = '0'; }, 2000);
        }
    }

    function parseNumericRating(val) {
        if (!val || val === 'N/A') return -1;
        return parseFloat(val.toString().replace(/[^0-9.]/g, '')) || -1;
    }

    function getSortedMovies() {
        let filteredData = rawMoviesData;
        if (searchQuery) {
            filteredData = filteredData.filter(item => {
                const searchTitle = item.mapped_name || item.title;
                const titleMatch = searchTitle.toLowerCase().includes(searchQuery);
                const imdbMatch = (item.imdb || '').toLowerCase().includes(searchQuery);
                const rtCriticsMatch = (item.rt_critics || '').toLowerCase().includes(searchQuery);
                const typeMatch = (item.type || '').toLowerCase().includes(searchQuery);
                
                return titleMatch || imdbMatch || rtCriticsMatch || typeMatch;
            });
        }
        
        if (selectedGenre) {
            filteredData = filteredData.filter(item => {
                if (!item.genre || item.genre === 'N/A') return false;
                const itemGenres = item.genre.split(',').map(g => g.trim());
                return itemGenres.includes(selectedGenre);
            });
        }
        
        if (hideWatched) {
            filteredData = filteredData.filter(item => {
                const u1 = appSettings.user1_name ? item.watched_remko : true;
                const u2 = appSettings.user2_name ? item.watched_mikaela : true;
                return !(appSettings.user1_name || appSettings.user2_name ? (u1 && u2) : item.watched);
            });
        }

        return filteredData.sort((a, b) => {
            let valA, valB;
            if (sortField === 'title') {
                const titleA = a.mapped_name || a.title;
                const titleB = b.mapped_name || b.title;
                valA = (titleA || '').toLowerCase();
                valB = (titleB || '').toLowerCase();
            } else if (sortField === 'watched_remko') {
                valA = a.watched_remko ? 1 : 0;
                valB = b.watched_remko ? 1 : 0;
            } else if (sortField === 'watched_mikaela') {
                valA = a.watched_mikaela ? 1 : 0;
                valB = b.watched_mikaela ? 1 : 0;
            } else if (sortField === 'rm_rating') {
                valA = parseNumericRating(a.rm_rating);
                valB = parseNumericRating(b.rm_rating);
            } else {
                valA = parseNumericRating(a[sortField]);
                valB = parseNumericRating(b[sortField]);
            }
            if (valA < valB) return sortAscending ? -1 : 1;
            if (valA > valB) return sortAscending ? 1 : -1;
            return 0;
        });
    }

    window.handlePosterError = function(imgElement, size) {
        if (size === 'small') {
            imgElement.outerHTML = `<div style="height: 45px; width: 30px; background: var(--surface-light); border: 1px solid var(--border-color); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 0.6rem; text-align: center; margin-right: 12px; box-sizing: border-box; line-height: 1;">N/A</div>`;
        } else {
            imgElement.outerHTML = `<div style="width: 250px; height: 375px; background: var(--surface-light); border: 1px solid var(--border-color); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); flex-shrink: 0; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">No Poster</div>`;
        }
    };

    function renderMovies() {
        updateStats();
        updateSortIcons();
        const tbody = document.getElementById('movie-tbody');
        tbody.innerHTML = '';
        
        if (rawMoviesData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="loader">No media found in volume.</td></tr>';
            return;
        }

        const sortedData = getSortedMovies();

        sortedData.forEach(item => {
            const tr = document.createElement('tr');
            if (item.watched_remko && item.watched_mikaela) tr.classList.add('watched-true');

            // Title Col
            const tdTitle = document.createElement('td');
            const isTv = item.type === 'series';
            const badge = isTv ? '<span class="series-badge">Series</span>' : '';
            const subtext = isTv ? `${item.episodes_count} episodes found` : item.filename;
            
            const displayTitle = item.mapped_name || item.title;
            const hasPoster = item.poster && item.poster !== 'N/A';
            const posterHtmlSmall = hasPoster 
                ? `<img src="${item.poster}" alt="poster" onerror="handlePosterError(this, 'small')" style="height: 45px; width: 30px; border-radius: 4px; object-fit: cover; margin-right: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">` 
                : `<div style="height: 45px; width: 30px; background: var(--surface-light); border: 1px solid var(--border-color); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 0.6rem; text-align: center; margin-right: 12px; box-sizing: border-box; line-height: 1;">N/A</div>`;
            
            tdTitle.innerHTML = `
                <div style="display: flex; align-items: center; cursor:pointer;" onclick="showDetails('${item.id.replace(/'/g, "\\'")}')" title="View Details">
                    ${posterHtmlSmall}
                    <div style="min-width: 0;">
                        <div class="movie-title">${badge}${displayTitle}</div>
                        <div class="movie-meta">${subtext}</div>
                    </div>
                </div>
            `;
            tr.appendChild(tdTitle);

            // Progress Col (Season/Episode)
            const tdProgress = document.createElement('td');
            if (isTv) {
                tdProgress.innerHTML = `
                    <div class="progress-container">
                        S <input type="text" class="progress-input" value="${item.season || ''}" 
                            onfocus="handleInputFocus(this, '${item.id.replace(/'/g, "\\'")}', 'season')" 
                            onblur="handleInputBlur(this)"
                            onkeydown="if(event.key==='Enter') { this.nextElementSibling?.click(); this.blur(); }" placeholder="-">
                        E <input type="text" class="progress-input" value="${item.episode || ''}" 
                            onfocus="handleInputFocus(this, '${item.id.replace(/'/g, "\\'")}', 'episode')" 
                            onblur="handleInputBlur(this)"
                            onkeydown="if(event.key==='Enter') { this.nextElementSibling?.click(); this.blur(); }" placeholder="-">
                    </div>
                `;
            } else {
                tdProgress.innerHTML = `<div class="movie-meta" style="opacity:0.3">—</div>`;
            }
            tr.appendChild(tdProgress);

            // Watched Remko Col
            const tdWatchedR = document.createElement('td');
            tdWatchedR.style.display = appSettings.user1_name ? 'table-cell' : 'none';
            const wrapperR = document.createElement('div');
            wrapperR.className = 'checkbox-wrapper';
            const checkboxR = document.createElement('input');
            checkboxR.type = 'checkbox';
            checkboxR.className = 'cyber-checkbox';
            checkboxR.checked = item.watched_remko;
            checkboxR.addEventListener('change', (e) => handleWatchToggle(item.id, 'watched_remko', e.target.checked, tr));
            wrapperR.appendChild(checkboxR);
            tdWatchedR.appendChild(wrapperR);
            tr.appendChild(tdWatchedR);

            // Watched Mikaela Col
            const tdWatchedM = document.createElement('td');
            tdWatchedM.style.display = appSettings.user2_name ? 'table-cell' : 'none';
            const wrapperM = document.createElement('div');
            wrapperM.className = 'checkbox-wrapper';
            const checkboxM = document.createElement('input');
            checkboxM.type = 'checkbox';
            checkboxM.className = 'cyber-checkbox';
            checkboxM.checked = item.watched_mikaela;
            checkboxM.addEventListener('change', (e) => handleWatchToggle(item.id, 'watched_mikaela', e.target.checked, tr));
            wrapperM.appendChild(checkboxM);
            tdWatchedM.appendChild(wrapperM);
            tr.appendChild(tdWatchedM);

            // IMDb Col
            const tdImdb = document.createElement('td');
            const imdbSearchUrl = `https://www.imdb.com/find?q=${encodeURIComponent(item.title)}`;
            tdImdb.innerHTML = `
                <div class="rating-badge rating-imdb">
                    <a href="${imdbSearchUrl}" target="_blank" title="Search on IMDb" style="text-decoration: none;">
                        <span class="icon" style="cursor: pointer;">★</span>
                    </a>
                    <input type="text" class="rating-input" style="width: 40px; background: transparent; border: 1px solid transparent; color: inherit; font-size: inherit; text-align: center;" value="${item.imdb !== 'N/A' ? item.imdb : ''}" 
                        onfocus="handleInputFocus(this, '${item.id.replace(/'/g, "\\'")}', 'imdb')" 
                        onblur="handleInputBlur(this)"
                        onkeydown="if(event.key==='Enter') { this.nextElementSibling?.click(); this.blur(); }" placeholder="N/A">
                </div>
            `;
            tr.appendChild(tdImdb);

            // RT Critics Col
            const tdRtCritics = document.createElement('td');
            const rtSearchUrl = `https://www.rottentomatoes.com/search?search=${encodeURIComponent(item.title)}`;
            const isNa = item.rt_critics === 'N/A' || item.rt_critics === '';
            const isFresh = !isNa && parseInt(item.rt_critics) >= 60;
            const rtIcon = isNa ? '<span style="filter: grayscale(1); opacity: 0.5;">🍅</span>' : (isFresh ? '🍅' : '🤢');
            tdRtCritics.innerHTML = `
                <div class="rating-badge rating-rt-critics">
                    <a href="${rtSearchUrl}" target="_blank" title="Search on Rotten Tomatoes" style="text-decoration: none;">
                        <span class="icon" style="cursor: pointer;">${rtIcon}</span>
                    </a>
                    <input type="text" class="rating-input" style="width: 40px; background: transparent; border: 1px solid transparent; color: inherit; font-size: inherit; text-align: center;" value="${item.rt_critics !== 'N/A' ? item.rt_critics : ''}" 
                        onfocus="handleInputFocus(this, '${item.id.replace(/'/g, "\\'")}', 'rt_critics')" 
                        onblur="handleInputBlur(this)"
                        onkeydown="if(event.key==='Enter') { this.nextElementSibling?.click(); this.blur(); }" placeholder="N/A">
                </div>
            `;
            tr.appendChild(tdRtCritics);
            // R&M Rating Col
            const tdRmRating = document.createElement('td');
            tdRmRating.innerHTML = `
                <input type="text" class="rating-input" value="${item.rm_rating || ''}" 
                    onfocus="handleInputFocus(this, '${item.id.replace(/'/g, "\\'")}', 'rm_rating')" 
                    onblur="handleInputBlur(this)"
                    onkeydown="if(event.key==='Enter') { this.nextElementSibling?.click(); this.blur(); }" placeholder="-">
            `;
            tr.appendChild(tdRmRating);

            tbody.appendChild(tr);
        });
    }

    window.toggleHideWatched = function() {
        hideWatched = !hideWatched;
        const btn = document.getElementById('hide-watched-toggle');
        if (btn) {
            btn.innerText = hideWatched ? 'Show Watched' : 'Hide Watched';
            btn.style.background = hideWatched ? 'var(--accent-blue)' : 'var(--surface-light)';
            btn.style.color = hideWatched ? 'white' : 'var(--text-color)';
        }
        renderMovies();
    };

    function updateStats() {
        let watchedMovies = 0;
        let totalMovies = 0;
        let watchedSeries = 0;
        let totalSeries = 0;
        
        rawMoviesData.forEach(item => {
            const u1 = appSettings.user1_name ? item.watched_remko : true;
            const u2 = appSettings.user2_name ? item.watched_mikaela : true;
            const isWatched = (!appSettings.user1_name && !appSettings.user2_name) ? item.watched : (u1 && u2);
            
            if (item.type === 'movie') {
                totalMovies++;
                if (isWatched) watchedMovies++;
            } else if (item.type === 'series') {
                totalSeries++;
                if (isWatched) watchedSeries++;
            }
        });
        
        const statsEl = document.getElementById('stats-container');
        if (statsEl) {
            let statsText = `<span style="margin-right: 15px;">🍿 Movies Completed: <strong style="color:var(--text-color);">${watchedMovies} / ${totalMovies}</strong></span>`;
            if (totalSeries > 0) {
                statsText += `<span>📺 Series Completed: <strong style="color:var(--text-color);">${watchedSeries} / ${totalSeries}</strong></span>`;
            }
            statsEl.innerHTML = statsText;
        }
    }

    window.handleGenreFilter = function(event) {
        selectedGenre = event.target.value;
        renderMovies();
    };

    function updateGenreDropdown() {
        const select = document.getElementById('genreFilter');
        if (!select) return;
        
        const genres = new Set();
        rawMoviesData.forEach(item => {
            if (item.genre && item.genre !== 'N/A') {
                item.genre.split(',').forEach(g => {
                    const trimmed = g.trim();
                    if (trimmed) genres.add(trimmed);
                });
            }
        });
        
        const sortedGenres = Array.from(genres).sort();
        const currentVal = select.value;
        
        let html = '<option value="">All Genres</option>';
        sortedGenres.forEach(g => {
            html += `<option value="${g}">${g}</option>`;
        });
        
        select.innerHTML = html;
        if (sortedGenres.includes(currentVal)) {
            select.value = currentVal;
        } else {
            select.value = "";
            if (selectedGenre) {
                selectedGenre = "";
                renderMovies();
            }
        }
    }

    // Initial fetch
    fetchSettings().then(() => {
        fetchMovies();
        setInterval(fetchMovies, 3000);
    });