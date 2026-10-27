# Local push check

Install this folder with `npm run hooks:install`. `pre-push` runs the same quality
command as GitHub before allowing a push. Local hooks can be bypassed; protected
branch rules must require GitHub's quality and browser checks for remote merging.
