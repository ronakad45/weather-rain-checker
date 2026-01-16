// Form handling and UX improvements
document.addEventListener('DOMContentLoaded', function() {
    // Form validation and loading state
    const form = document.querySelector('form');
    const locationInput = document.getElementById('location');
    const submitButton = form?.querySelector('button[type="submit"]');
    
    if (form && submitButton) {
        form.addEventListener('submit', function(e) {
            if (locationInput && locationInput.value.trim() === '') {
                e.preventDefault();
                showError('Please enter a location');
                locationInput.focus();
                return;
            }
            
            // Add loading state
            submitButton.innerHTML = '<div class="loading-spinner"></div>';
            submitButton.disabled = true;
            submitButton.classList.add('form-loading');
            
            // Store original text
            submitButton.dataset.originalText = submitButton.innerHTML;
        });
    }
    
    // Auto-focus location input
    if (locationInput) {
        locationInput.focus();
    }
    
    // Clear error when user starts typing
    if (locationInput) {
        locationInput.addEventListener('input', function() {
            const errorElement = document.querySelector('.error-message');
            if (errorElement) {
                errorElement.style.display = 'none';
            }
        });
    }
    
    // Add keyboard shortcut (Ctrl+K) to focus search
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            if (locationInput) {
                locationInput.focus();
            }
        }
        
        // Escape to clear search
        if (e.key === 'Escape' && locationInput) {
            locationInput.value = '';
            locationInput.focus();
        }
    });
    
    // Show user's current location option
    if (navigator.geolocation && document.querySelector('.current-location-btn')) {
        document.querySelector('.current-location-btn').style.display = 'block';
    }
    
    // Helper function to show error messages
    function showError(message) {
        // Remove any existing error messages
        const existingError = document.querySelector('.form-error');
        if (existingError) {
            existingError.remove();
        }
        
        // Create error message element
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message form-error';
        errorElement.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
        errorElement.style.cssText = `
            background: #fee;
            color: #dc3545;
            padding: 10px 15px;
            border-radius: 5px;
            margin: 10px 0;
            border: 1px solid #f5c6cb;
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        
        // Insert after the form or before submit button
        if (form) {
            form.insertBefore(errorElement, submitButton);
        }
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorElement.parentNode) {
                errorElement.style.opacity = '0';
                errorElement.style.transition = 'opacity 0.3s';
                setTimeout(() => errorElement.remove(), 300);
            }
        }, 5000);
    }
    
    // Add current location button functionality
    const currentLocationBtn = document.querySelector('.current-location-btn');
    if (currentLocationBtn) {
        currentLocationBtn.addEventListener('click', function() {
            if (navigator.geolocation) {
                this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting...';
                this.disabled = true;
                
                navigator.geolocation.getCurrentPosition(
                    function(position) {
                        // Reverse geocode to get city name
                        fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${position.coords.latitude}&lon=${position.coords.longitude}&limit=1&appid=${YOUR_API_KEY}`)
                            .then(response => response.json())
                            .then(data => {
                                if (data && data[0]) {
                                    locationInput.value = data[0].name;
                                    submitButton.click();
                                }
                            })
                            .catch(() => {
                                showError('Could not detect your city name');
                            })
                            .finally(() => {
                                currentLocationBtn.innerHTML = '<i class="fas fa-location-arrow"></i> Use My Location';
                                currentLocationBtn.disabled = false;
                            });
                    },
                    function(error) {
                        showError('Unable to access your location. Please enter manually.');
                        currentLocationBtn.innerHTML = '<i class="fas fa-location-arrow"></i> Use My Location';
                        currentLocationBtn.disabled = false;
                    }
                );
            }
        });
    }
});