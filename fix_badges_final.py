import re

def fix():
    with open('landing.html', 'r', encoding='utf-8') as f:
        land_content = f.read()

    # Extract exact Trust Badges block from landing.html
    start_tag = '        <!-- Trust Badges Section -->'
    end_tag = '        </section>'
    
    start_idx = land_content.find(start_tag)
    end_idx = land_content.find(end_tag, start_idx) + len(end_tag)
    
    if start_idx == -1 or end_idx == -1:
        print("COULD NOT FIND LANDING BLOCK")
        return
        
    landing_badges = land_content[start_idx:end_idx]
    
    # Preserve the Title Case fix class they had us create!
    landing_badges = landing_badges.replace('<h4 class="text-[', '<h4 class="my-super-unique-badge-style text-[')
    
    # Read index.html
    with open('index.html', 'r', encoding='utf-8') as f:
        idx_content = f.read()
        
    # Replace the existing block in index.html
    idx_start_tag = '        <!-- TRUST BADGES SECTION'
    idx_end_tag = '            </div>\n        </div>\n    </div>' # The block ends before home-top-elements finishes
    
    idx_start = idx_content.find(idx_start_tag)
    
    # We want to replace from idx_start up to the outer container closing.
    # Let's find the `</div>` that precedes MAIN APP CONTAINER
    main_app_idx = idx_content.find('<!-- MAIN APP CONTAINER -->')
    if idx_start == -1 or main_app_idx == -1:
        print("COULD NOT FIND INDEX BLOCK")
        return
        
    # In index.html, home-top-elements closes right before MAIN APP CONTAINER
    # So we want to replace from idx_start up to but NOT INCLUDING the closing </div> of home-top-elements.
    # Let's find the end manually by looking backwards from main_app_idx
    search_area = idx_content[idx_start:main_app_idx]
    
    # Wait, the structure in index is:
    # <!-- TRUST BADGES SECTION... -->
    # <div...>
    #   <div...>
    #     <div...> SVGs </div>
    #   </div>
    # </div>
    # </div> <!-- this one closes home-top-elements -->
    
    # We will just replace everything from '<!-- TRUST BADGES SECTION' until the </div> just before MAIN APP.
    
    # Actually, the simplest is to match the section.
    # Let's write the exact closing logic.
    idx_lines = idx_content.splitlines()
    block_start_line = -1
    for i, line in enumerate(idx_lines):
        if '<!-- TRUST BADGES SECTION' in line:
            block_start_line = i
            break
            
    block_end_line = -1
    for i in range(block_start_line, len(idx_lines)):
        if '<!-- MAIN APP CONTAINER -->' in idx_lines[i]:
            block_end_line = i - 2
            # back up past any blank lines
            while idx_lines[block_end_line].strip() == '':
                block_end_line -= 1
            # we don't want to delete the home-top-elements closing div, we only want to delete the badge wrappers.
            # My previous index.html badges had 3 opening divs: w-full, w-full, grid.
            # So I should delete up to the line BEFORE home-top-elements closing div.
            break
            
    # To be perfectly safe, I'm just going to replace exactly what I need.
    prefix = idx_lines[:block_start_line]
    suffix = idx_lines[block_end_line:]  # keep the closing div of home-top-elements
    
    # I'll modify the landing badges lightly to make sure we don't add unnecessary background colors that clank with the slider, BUT user specifically asked for EXACT same background color/animation/spacing as landing.
    # Landing uses: <section class="bg-gray-50/50 py-10 sm:py-16 border-b border-gray-100">
    # I will just put it directly as is.
    
    new_content = '\n'.join(prefix) + '\n' + landing_badges + '\n' + '\n'.join(suffix)
    
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
        
    print("SUCCESS MIGRATING EXACT LANDING SVGS")

if __name__ == '__main__':
    fix()
