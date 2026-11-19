@props(['name', 'label', 'type' => 'text', 'value' => '', 'hint' => null, 'showError' => true])
<div class="field">
    <label for="{{ $name }}">{{ $label }}</label>
    <div class="input-group">
        <input id="{{ $name }}" name="{{ $name }}" type="{{ $type }}"
            value="{{ $type === 'password' ? '' : old($name, $value) }}"
            {{ $attributes }}
            @if($errors->has($name)) aria-invalid="true" @endif
            aria-describedby="{{ $name }}-help {{ $name }}-error">
        @if($type === 'password')
            <button class="password-toggle" type="button" data-password-toggle="{{ $name }}" aria-controls="{{ $name }}" aria-pressed="false" aria-label="Show {{ strtolower($label) }}">Show</button>
        @endif
    </div>
    <small id="{{ $name }}-help">{{ $hint }}</small>
    <small class="field-error" id="{{ $name }}-error">@if($showError) @error($name){{ $message }}@enderror @endif</small>
</div>
