// Add any client-side functionality here if needed

// Form validation
document.addEventListener('DOMContentLoaded', function() {
    const form = document.querySelector('form');
    if (form) {
        form.addEventListener('submit', function(e) {
            const locationInput = document.getElementById('location');
            if (locationInput && locationInput.value.trim() === '') {
                e.preventDefault();
                alert('Please enter a location');
                locationInput.focus();
            }
        });
    }

    // Add loading state to submit button
    const submitButton = form?.querySelector('button[type="submit"]');
    if (submitButton) {
        form.addEventListener('submit', function() {
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking Weather...';
            submitButton.disabled = true;
        });
    }
});