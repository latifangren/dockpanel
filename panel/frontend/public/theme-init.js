(function(){
  var t=localStorage.getItem('dp-theme');
  if(!t||t==='terminal')t='lite-mix';
  else if(t==='dark'||t==='nexus-dark')t='lite-midnight';
  else if(t==='light'||t==='nexus')t='lite-clean';
  document.documentElement.setAttribute('data-theme',t);
  document.documentElement.setAttribute('data-color-scheme',(t==='arctic'||t==='clean'||t==='lite-mix'||t==='lite-clean')?'light':'dark');
})();
