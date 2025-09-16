document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['savedPosts'], (result) => {
    const posts = result.savedPosts || [];
    const container = document.getElementById('posts-container');
    
    if (posts.length > 0) {
      container.innerHTML = '<ul></ul>';
      const ul = container.querySelector('ul');
      posts.forEach(post => {
        const li = document.createElement('li');
        
        const a = document.createElement('a');
        a.href = post.url;
        a.target = "_blank";
        a.textContent = post.content || 'Click to view post';
        
        const small = document.createElement('small');
        small.textContent = new Date(post.timestamp).toLocaleDateString();
        
        li.appendChild(a);
        li.appendChild(small);
        ul.appendChild(li);
      });
    }
  });
});