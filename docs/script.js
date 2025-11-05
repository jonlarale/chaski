const nav = document.querySelector('[data-nav]');

if (nav) {
	const toggle = nav.querySelector('.nav-toggle');
	const links = nav.querySelector('.nav-links');

	if (toggle && links) {
		const closeMenu = () => {
			nav.classList.remove('nav-open');
			toggle.setAttribute('aria-expanded', 'false');
		};

		toggle.addEventListener('click', () => {
			const isOpen = nav.classList.toggle('nav-open');
			toggle.setAttribute('aria-expanded', String(isOpen));
		});

		links.querySelectorAll('a').forEach((anchor) => {
			anchor.addEventListener('click', () => {
				if (nav.classList.contains('nav-open')) {
					closeMenu();
				}
			});
		});

		window.addEventListener('resize', () => {
			if (window.innerWidth > 720 && nav.classList.contains('nav-open')) {
				closeMenu();
			}
		});
	}
}
