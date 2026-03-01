// Set current year in footer
document.addEventListener('DOMContentLoaded', function() {
  const yearElement = document.getElementById('yr');
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }

  // Mobile menu toggle
  const menuBtn = document.getElementById('menuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  
  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => {
      const isOpen = menuBtn.getAttribute('aria-expanded') === 'true';
      menuBtn.setAttribute('aria-expanded', String(!isOpen));
      mobileMenu.classList.toggle('hidden');
    });

    // Close mobile menu when clicking a link
    mobileMenu.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
        menuBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Show more skills toggle
  const moreBtn = document.getElementById('moreSkillsBtn');
  const moreSkills = document.getElementById('moreSkills');
  
  if (moreBtn && moreSkills) {
    moreBtn.addEventListener('click', () => {
      const isHidden = moreSkills.classList.contains('hidden');
      moreSkills.classList.toggle('hidden');
      moreBtn.setAttribute('aria-expanded', String(isHidden));
      moreBtn.textContent = isHidden ? 'Show less skills' : 'Show more skills';
    });
  }

  // Music Player
  initMusicPlayer();
});

// Music Player Functionality
function initMusicPlayer() {
  // Create audio element
  const audio = document.createElement('audio');
  audio.src = 'music.mp3';
  audio.loop = true;
  audio.preload = 'auto';
  document.body.appendChild(audio);

  // Create music player button
  const musicPlayer = document.createElement('div');
  musicPlayer.className = 'musicPlayer';
  musicPlayer.setAttribute('aria-label', 'Toggle background music');
  musicPlayer.setAttribute('role', 'button');
  musicPlayer.setAttribute('tabindex', '0');

  // SVG icons for play and pause
  const playIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z"/>
    </svg>
  `;
  
  const pauseIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
    </svg>
  `;

  // Set initial icon (play)
  musicPlayer.innerHTML = playIcon;
  let isPlaying = false;

  // Toggle play/pause function
  function toggleMusic() {
    if (isPlaying) {
      audio.pause();
      musicPlayer.innerHTML = playIcon;
      musicPlayer.classList.remove('playing');
      isPlaying = false;
    } else {
      audio.play().catch(error => {
        console.log('Audio play failed:', error);
        // Some browsers require user interaction before playing audio
      });
      musicPlayer.innerHTML = pauseIcon;
      musicPlayer.classList.add('playing');
      isPlaying = true;
    }
  }

  // Click event
  musicPlayer.addEventListener('click', toggleMusic);

  // Keyboard accessibility
  musicPlayer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleMusic();
    }
  });

  // Update icon when audio state changes (handles browser autoplay restrictions)
  audio.addEventListener('play', () => {
    musicPlayer.innerHTML = pauseIcon;
    musicPlayer.classList.add('playing');
    isPlaying = true;
  });

  audio.addEventListener('pause', () => {
    musicPlayer.innerHTML = playIcon;
    musicPlayer.classList.remove('playing');
    isPlaying = false;
  });

  // Handle audio errors
  audio.addEventListener('error', () => {
    console.log('Error loading audio file');
    musicPlayer.style.display = 'none';
  });

  // Append music player to body
  document.body.appendChild(musicPlayer);
}
