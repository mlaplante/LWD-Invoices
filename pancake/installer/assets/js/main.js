$('input, select, textarea').bind({
    focusin: function () {
        var wrapper = $(this).closest('tr');
        $(wrapper).addClass('focus');
    },
    focusout: function () {
        var wrapper = $(this).closest('tr');
        $(wrapper).removeClass('focus');
    }
});