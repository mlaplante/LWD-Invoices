!(function($){
	var settings = {};

	var fn = {};
	
	var $this,list;

	fn.init = function(options){
		$this = $(this);

		if($this.find('div.supplier-list').length < 1){
			$.error('Can\'t find a list for this widget');
			return;
		}
			
		list = $this.find('div.supplier-list:last');

		fn.init_add_field_events();
	}

	fn.field_template=function(){
		var container = $('<div/>');
			container.addClass('twelve columns');

		var inputs = {
			'name': $('<input/>').attr('type','text').attr('name','supplier_extra_name[]').attr('placeholder','Field Name'),
			'value': $('<input/>').attr('type','text').attr('name','supplier_extra_value[]').attr('placeholder','Field Value')
		};

		var input_containers = {
			'name' : $('<div/>').addClass('six columns').append(inputs.name),
			'value': $('<div/>').addClass('six columns').append(inputs.value)
		};

		container.append(input_containers.name).append(input_containers.value);

		return container;
	}

	fn.init_add_field_events=function(){
		$('a.btn-add-field').on('click',function(ev){
			list.append(fn.field_template());
		});
	}


	$.fn.dynamic_fields=function(method){
		// Method calling logic
	    if ( fn[method] ) {
	      return fn[ method ].apply( this, Array.prototype.slice.call( arguments, 1 ));
	    } else if ( typeof method === 'object' || ! method ) {
	      return fn.init.apply( this, arguments );
	    } else {
	      $.error( 'Method ' +  method + ' does not exist on jQuery.tooltip' );
	    }  
	}

})(jQuery);

$('div.dynamic-fields').dynamic_fields();