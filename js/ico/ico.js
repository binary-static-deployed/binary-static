// Handler when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", function(){

    // Handle form submission
    if (window.location.hash === '#done') {
        for (let i = 0; i < 2; i++) {
            document.querySelectorAll('.notice-msg')[i].classList.remove('invisible');
            document.getElementsByTagName('form')[i].classList.add('invisible');
        }
        if(window.history.pushState) {
            window.history.pushState('', '/', window.location.pathname)
        } else {
            window.location.hash = '';
        }
        let navbarHeight = checkWidth();
        const to = document.getElementById('coming-soon').offsetTop - navbarHeight;
        scrollTo(document.body, to, 1500);
    }

    // Toggle mobile menu
    const toggleButton = document.getElementById('toggle-menu');
    toggleButton.addEventListener('click', function (e) {
        const navbar = document.getElementsByClassName('navbar-fixed-top')[0];
        if (navbar.classList.contains('expand')) {
            navbar.classList.remove('expand');
        } else {
            navbar.classList.add('expand');
        }
        e.stopPropagation();
    });

    // Scroll to section
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('page-scroll')) {
            const target = e.target.getAttribute('href').substr(1);
            let offset = 0;
            if (target === 'who-we-are' || target === 'page-top') {
                offset = 55;
            }
            let navbarHeight = checkWidth();
            const to = document.getElementById(target).offsetTop - navbarHeight - offset;
            scrollTo(document.body, to, 1500);
            e.preventDefault();
        }
    });

    window.onresize = checkWidth;
    window.onscroll = collapseNavbar;
    document.ready = collapseNavbar;
});

// Collapse navbar on scroll
function collapseNavbar() {
    const navbarFixedTopEl = document.getElementsByClassName('navbar-fixed-top');
    if (window.scrollY > 50) {
        navbarFixedTopEl[0].classList.add('top-nav-collapse');
    } else {
        navbarFixedTopEl[0].classList.remove('top-nav-collapse');
    }
}

function checkWidth() {
    let navbarHeight;
    if (window.innerWidth <= 320) {
        navbarHeight = 0;
    } else {
        navbarHeight = document.getElementsByClassName('navbar-fixed-top')[0].scrollHeight;
    }
    return navbarHeight;
}

// scrollTo function with animation
// - Gist reference: https://gist.github.com/andjosh/6764939
function scrollTo(element, to, duration) {
    let start = element.scrollTop,
        change = to - start,
        currentTime = 0,
        increment = 20;

    const animateScroll = function(){
        currentTime += increment;
        let val = Math.easeInOutQuad(currentTime, start, change, duration);
        element.scrollTop = val;
        if(currentTime < duration) {
            setTimeout(animateScroll, increment);
        }
    };
    animateScroll();
}

//t = current time
//b = start value
//c = change in value
//d = duration
Math.easeInOutQuad = function (t, b, c, d) {
    t /= d/2;
    if (t < 1) return c/2*t*t + b;
    t--;
    return -c/2 * (t*(t-2) - 1) + b;
};