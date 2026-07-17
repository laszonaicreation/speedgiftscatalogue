const fs = require('fs');
const https = require('https');

https.get('https://renderhome-fwxy53lexq-uc.a.run.app/', res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
        // Extract _sgSSRSliderKeys
        const keyMatch = d.match(/window\._sgSSRSliderKeys=({[^}]+})/);
        if (keyMatch) {
            console.log('SSR Key:', keyMatch[1].substring(0, 200));
        }

        // Simulate visibleSliders from __INJECTED_HOME_DATA__
        const dataMatch = d.match(/window\.__INJECTED_HOME_DATA__ = ({.+?});/);
        if (dataMatch) {
            const data = JSON.parse(dataMatch[1]);
            const sortedSliders = [...data.sliders].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
            const isUrl = (val) => val && typeof val === 'string' && val.trim() !== '' && val !== 'img/';
            const visibleSliders = sortedSliders.filter(s => {
                const hasMobile = isUrl(s.mobileImg);
                const hasDesktop = isUrl(s.img);
                return true ? hasMobile : hasDesktop; // Mobile test
            });

            const isMobile = true;
            const nextMarkupKey = [
                isMobile ? 'm' : 'd',
                ...visibleSliders.map((s) => `${s.id || ''}|${isMobile ? (s.mobileImg || '') : (s.img || '')}|${s.title || ''}|${s.link || ''}`)
            ].join('::');
            console.log('\nNext Key:', nextMarkupKey.substring(0, 200));
        }
    });
});
