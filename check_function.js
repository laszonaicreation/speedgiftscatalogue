const https = require('https');
https.get('https://renderhome-fwxy53lexq-uc.a.run.app/', res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
        console.log('Status:', res.statusCode, '✅');
        
        // Check data-ssr-slide
        console.log('\ndata-ssr-slide="1":', d.includes('data-ssr-slide="1"') ? 'YES ✅' : 'NO ❌');
        
        // Check _sgSSRSliderKeys
        const keyMatch = d.match(/_sgSSRSliderKeys=({[^}]{1,200})/);
        if (keyMatch) {
            console.log('\n_sgSSRSliderKeys: YES ✅');
            try {
                // Get just the first part of the key to verify format
                const raw = keyMatch[1];
                console.log('  Raw (first 120 chars):', raw.substring(0, 120));
            } catch(e) { console.log('  Error:', e.message); }
        } else {
            console.log('\n_sgSSRSliderKeys: NO ❌');
        }
        
        // Check __INJECTED_HOME_DATA__
        console.log('\n__INJECTED_HOME_DATA__:', d.includes('__INJECTED_HOME_DATA__') ? 'YES ✅' : 'NO ❌');
        
        // Count slider slides in HTML
        const ssrSlides = (d.match(/data-ssr-slide="1"/g) || []).length;
        console.log('SSR slides injected:', ssrSlides);
        
        console.log('\n✅ ALL CHECKS DONE');
    });
});
